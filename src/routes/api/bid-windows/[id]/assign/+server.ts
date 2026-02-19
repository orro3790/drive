/**
 * Bid Window Manual Assignment API
 *
 * POST /api/bid-windows/[id]/assign - Manually assign a driver and close bidding
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { assignments, bidWindows, bids, routes, user, warehouses } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { sendBulkNotifications, sendNotification } from '$lib/server/services/notifications';
import { getBidWindowDetail } from '$lib/server/services/bidding';
import { bidWindowIdParamsSchema } from '$lib/schemas/api/bidding';
import { createAuditLog } from '$lib/server/services/audit';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import { formatNotificationShiftContext } from '$lib/utils/notifications/shiftContext';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed
} from '$lib/server/realtime/managerSse';

const assignSchema = z
	.object({
		driverId: z
			.string()
			.trim()
			.min(1)
			.max(128)
			.regex(/^[A-Za-z0-9:_-]+$/)
	})
	.strict();

const PG_UNIQUE_VIOLATION = '23505';
const ACTIVE_ASSIGNMENT_CONSTRAINT = 'uq_assignments_active_user_date';

function isActiveAssignmentConflict(err: unknown): boolean {
	if (typeof err !== 'object' || err === null) {
		return false;
	}

	const code = 'code' in err ? (err as { code?: unknown }).code : undefined;
	const constraint = 'constraint' in err ? (err as { constraint?: unknown }).constraint : undefined;

	return code === PG_UNIQUE_VIOLATION && constraint === ACTIVE_ASSIGNMENT_CONSTRAINT;
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	const actorId = manager.id;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = assignSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const paramsResult = bidWindowIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid bid window ID');
	}

	const windowId = paramsResult.data.id;

	const [window] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			status: bidWindows.status,
			assignmentStatus: assignments.status,
			assignmentUserId: assignments.userId,
			assignmentDate: assignments.date,
			routeId: assignments.routeId,
			routeName: routes.name,
			routeStartTime: routes.startTime,
			warehouseId: assignments.warehouseId
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(eq(bidWindows.id, windowId));

	if (!window) {
		throw error(404, 'Bid window not found');
	}

	const canAccess = await canManagerAccessWarehouse(actorId, window.warehouseId, organizationId);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

	if (window.status !== 'open') {
		throw error(409, 'Bid window already resolved');
	}

	if (!['unfilled', 'cancelled'].includes(window.assignmentStatus)) {
		throw error(409, 'Assignment already filled');
	}

	const [driver] = await db
		.select({ id: user.id, name: user.name, role: user.role })
		.from(user)
		.where(eq(user.id, result.data.driverId));

	if (!driver || driver.role !== 'driver') {
		throw error(400, 'Driver not found');
	}

	const pendingBids = await db
		.select({ id: bids.id, userId: bids.userId })
		.from(bids)
		.where(and(eq(bids.bidWindowId, window.id), eq(bids.status, 'pending')));

	const resolvedAt = new Date();

	const transactionResult = await db
		.transaction(async (tx) => {
			const [updatedWindow] = await tx
				.update(bidWindows)
				.set({ status: 'resolved', winnerId: driver.id })
				.where(and(eq(bidWindows.id, window.id), eq(bidWindows.status, 'open')))
				.returning({ id: bidWindows.id });

			if (!updatedWindow) {
				return { outcome: 'not_open' as const };
			}

			const [updatedAssignment] = await tx
				.update(assignments)
				.set({
					userId: driver.id,
					status: 'scheduled',
					assignedBy: 'manager',
					assignedAt: resolvedAt,
					updatedAt: resolvedAt
				})
				.where(
					and(
						eq(assignments.id, window.assignmentId),
						inArray(assignments.status, ['unfilled', 'cancelled'])
					)
				)
				.returning({ id: assignments.id });

			if (!updatedAssignment) {
				return { outcome: 'assignment_filled' as const };
			}

			if (pendingBids.length > 0) {
				await tx
					.update(bids)
					.set({ status: 'lost', resolvedAt })
					.where(and(eq(bids.bidWindowId, window.id), eq(bids.status, 'pending')));

				const winnerBid = pendingBids.find((bid) => bid.userId === driver.id);
				if (winnerBid) {
					await tx.update(bids).set({ status: 'won', resolvedAt }).where(eq(bids.id, winnerBid.id));
				}
			}

			await createAuditLog(
				{
					entityType: 'assignment',
					entityId: window.assignmentId,
					action: 'manual_assign',
					actorType: 'user',
					actorId,
					changes: {
						before: {
							status: window.assignmentStatus,
							userId: window.assignmentUserId
						},
						after: {
							status: 'scheduled',
							userId: driver.id,
							assignedBy: 'manager',
							assignedAt: resolvedAt
						},
						bidWindowId: window.id
					}
				},
				tx
			);

			return { outcome: 'ok' as const };
		})
		.catch((err) => {
			if (isActiveAssignmentConflict(err)) {
				return { outcome: 'driver_conflict' as const };
			}

			throw err;
		});

	if (transactionResult.outcome === 'not_open') {
		throw error(409, 'Bid window already resolved');
	}

	if (transactionResult.outcome === 'assignment_filled') {
		throw error(409, 'Assignment already filled');
	}

	if (transactionResult.outcome === 'driver_conflict') {
		throw error(409, 'Driver already has a non-cancelled shift on this date');
	}

	const notificationData = {
		assignmentId: window.assignmentId,
		bidWindowId: window.id,
		routeName: window.routeName,
		routeStartTime: window.routeStartTime,
		assignmentDate: window.assignmentDate
	};
	const shiftContext = formatNotificationShiftContext(window.assignmentDate, window.routeStartTime);

	await sendNotification(driver.id, 'assignment_confirmed', {
		customBody: `You were assigned ${window.routeName} for ${shiftContext}.`,
		data: notificationData,
		organizationId
	});

	const loserIds = pendingBids.filter((bid) => bid.userId !== driver.id).map((bid) => bid.userId);

	if (loserIds.length > 0) {
		await sendBulkNotifications(loserIds, 'bid_lost', {
			customBody: `${window.routeName} for ${shiftContext} was assigned by a manager.`,
			data: notificationData,
			organizationId
		});
	}

	broadcastBidWindowClosed(organizationId, {
		assignmentId: window.assignmentId,
		bidWindowId: window.id,
		winnerId: driver.id,
		winnerName: driver.name
	});

	broadcastAssignmentUpdated(organizationId, {
		assignmentId: window.assignmentId,
		status: 'scheduled',
		driverId: driver.id,
		driverName: driver.name,
		routeId: window.routeId
	});

	const bidWindow = await getBidWindowDetail(window.id, organizationId);

	return json({ bidWindow });
};
