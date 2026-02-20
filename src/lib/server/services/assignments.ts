import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { assignments, bids, bidWindows, routes, user, warehouses } from '$lib/server/db/schema';
import { createAuditLog } from '$lib/server/services/audit';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { sendBulkNotifications, sendNotification } from '$lib/server/services/notifications';
import { formatNotificationShiftContext } from '$lib/utils/notifications/shiftContext';
import * as m from '$lib/paraglide/messages.js';
import {
	getDriverWeeklyAssignmentCount,
	getWeekStartForDateString
} from '$lib/server/services/scheduling';
import type { AssignmentStatus } from '$lib/schemas/assignment';

export type ManualAssignErrorCode =
	| 'assignment_not_found'
	| 'forbidden'
	| 'assignment_not_assignable'
	| 'driver_not_found'
	| 'driver_flagged'
	| 'driver_over_weekly_cap';

type ManualAssignFailure = {
	ok: false;
	code: ManualAssignErrorCode;
};

type ManualAssignSuccess = {
	ok: true;
	assignmentId: string;
	routeId: string;
	routeName: string;
	assignmentDate: string;
	driverId: string;
	driverName: string;
	bidWindowId: string | null;
};

export type ManualAssignResult = ManualAssignSuccess | ManualAssignFailure;

export async function manualAssignDriverToAssignment(params: {
	assignmentId: string;
	driverId: string;
	actorId: string;
	organizationId?: string;
	allowedStatuses?: AssignmentStatus[];
}): Promise<ManualAssignResult> {
	const allowedStatuses = params.allowedStatuses ?? ['unfilled'];
	const scopedOrganizationId = params.organizationId;
	const assignmentConditions = [eq(assignments.id, params.assignmentId)];
	if (scopedOrganizationId) {
		assignmentConditions.push(eq(warehouses.organizationId, scopedOrganizationId));
	}

	const [assignment] = await db
		.select({
			id: assignments.id,
			routeId: assignments.routeId,
			routeName: routes.name,
			routeStartTime: routes.startTime,
			warehouseId: assignments.warehouseId,
			date: assignments.date,
			status: assignments.status,
			userId: assignments.userId,
			organizationId: warehouses.organizationId
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(and(...assignmentConditions));

	if (!assignment || !assignment.organizationId) {
		return { ok: false, code: 'assignment_not_found' };
	}

	const assignmentOrganizationId = assignment.organizationId;

	const canAccessWarehouse = await canManagerAccessWarehouse(
		params.actorId,
		assignment.warehouseId,
		assignmentOrganizationId
	);
	if (!canAccessWarehouse) {
		return { ok: false, code: 'forbidden' };
	}

	if (!allowedStatuses.includes(assignment.status)) {
		return { ok: false, code: 'assignment_not_assignable' };
	}

	const [driver] = await db
		.select({
			id: user.id,
			name: user.name,
			role: user.role,
			isFlagged: user.isFlagged,
			weeklyCap: user.weeklyCap
		})
		.from(user)
		.where(and(eq(user.id, params.driverId), eq(user.organizationId, assignmentOrganizationId)));

	if (!driver || driver.role !== 'driver') {
		return { ok: false, code: 'driver_not_found' };
	}

	if (driver.isFlagged) {
		return { ok: false, code: 'driver_flagged' };
	}

	const assignmentWeekStart = getWeekStartForDateString(assignment.date);
	const currentAssignmentCount = await getDriverWeeklyAssignmentCount(
		driver.id,
		assignmentWeekStart,
		assignmentOrganizationId
	);
	if (currentAssignmentCount >= driver.weeklyCap) {
		return { ok: false, code: 'driver_over_weekly_cap' };
	}

	const assignedAt = new Date();

	const transactionResult = await db.transaction(async (tx) => {
		const [window] = await tx
			.select({ id: bidWindows.id })
			.from(bidWindows)
			.where(and(eq(bidWindows.assignmentId, assignment.id), eq(bidWindows.status, 'open')))
			.orderBy(desc(bidWindows.opensAt), desc(bidWindows.id))
			.limit(1);

		const pendingBids = window
			? await tx
					.select({ id: bids.id, userId: bids.userId })
					.from(bids)
					.where(and(eq(bids.bidWindowId, window.id), eq(bids.status, 'pending')))
			: [];

		const [updatedAssignment] = await tx
			.update(assignments)
			.set({
				userId: driver.id,
				status: 'scheduled',
				assignedBy: 'manager',
				assignedAt,
				updatedAt: assignedAt
			})
			.where(and(eq(assignments.id, assignment.id), inArray(assignments.status, allowedStatuses)))
			.returning({ id: assignments.id });

		if (!updatedAssignment) {
			return { outcome: 'assignment_not_assignable' as const };
		}

		let resolvedBidWindowId: string | null = null;
		let windowPendingBids: Array<{ id: string; userId: string }> = [];

		if (window) {
			const [updatedWindow] = await tx
				.update(bidWindows)
				.set({
					status: 'resolved',
					winnerId: null
				})
				.where(and(eq(bidWindows.id, window.id), eq(bidWindows.status, 'open')))
				.returning({ id: bidWindows.id });

			if (updatedWindow) {
				resolvedBidWindowId = updatedWindow.id;
				windowPendingBids = pendingBids;

				if (pendingBids.length > 0) {
					await tx
						.update(bids)
						.set({
							status: 'lost',
							resolvedAt: assignedAt
						})
						.where(and(eq(bids.bidWindowId, window.id), eq(bids.status, 'pending')));
				}
			}
		}

		await createAuditLog(
			{
				entityType: 'assignment',
				entityId: assignment.id,
				action: 'manual_assign',
				actorType: 'user',
				actorId: params.actorId,
				changes: {
					before: {
						status: assignment.status,
						userId: assignment.userId
					},
					after: {
						status: 'scheduled',
						userId: driver.id,
						assignedBy: 'manager',
						assignedAt
					},
					bidWindowId: resolvedBidWindowId
				}
			},
			tx
		);

		return {
			outcome: 'ok' as const,
			bidWindowId: resolvedBidWindowId,
			pendingBids: windowPendingBids
		};
	});

	if (transactionResult.outcome !== 'ok') {
		return { ok: false, code: 'assignment_not_assignable' };
	}

	const notificationData: Record<string, string> = {
		assignmentId: assignment.id,
		routeName: assignment.routeName,
		routeStartTime: assignment.routeStartTime,
		assignmentDate: assignment.date
	};
	if (transactionResult.bidWindowId) {
		notificationData.bidWindowId = transactionResult.bidWindowId;
	}
	const shiftContext = formatNotificationShiftContext(assignment.date, assignment.routeStartTime);

	await sendNotification(driver.id, 'assignment_confirmed', {
		renderBody: (locale) =>
			m.notif_assignment_confirmed_body(
				{ routeName: assignment.routeName, shiftContext },
				{ locale }
			),
		data: notificationData,
		organizationId: assignmentOrganizationId
	});

	const loserIds = transactionResult.pendingBids
		.filter((bid) => bid.userId !== driver.id)
		.map((bid) => bid.userId);
	if (loserIds.length > 0) {
		await sendBulkNotifications(loserIds, 'bid_lost', {
			renderBody: (locale) =>
				m.notif_assignment_confirmed_manager_body(
					{ routeName: assignment.routeName, shiftContext },
					{ locale }
				),
			data: notificationData,
			organizationId: assignmentOrganizationId
		});
	}

	return {
		ok: true,
		assignmentId: assignment.id,
		routeId: assignment.routeId,
		routeName: assignment.routeName,
		assignmentDate: assignment.date,
		driverId: driver.id,
		driverName: driver.name,
		bidWindowId: transactionResult.bidWindowId
	};
}
