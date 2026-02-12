import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseRouteStartTime } from '$lib/config/dispatchPolicy';
import { assignmentIdParamsSchema, assignmentOverrideSchema } from '$lib/schemas/assignment';
import { db } from '$lib/server/db';
import { assignments, bids, bidWindows, routes, user, warehouses } from '$lib/server/db/schema';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed
} from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';
import { manualAssignDriverToAssignment } from '$lib/server/services/assignments';
import { createBidWindow } from '$lib/server/services/bidding';
import { getEmergencyBonusPercent } from '$lib/server/services/dispatchSettings';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { getTorontoDateTimeInstant } from '$lib/server/time/toronto';
import { and, desc, eq } from 'drizzle-orm';

type OverrideErrorCode =
	| 'validation_failed'
	| 'assignment_not_found'
	| 'forbidden'
	| 'invalid_assignment_state'
	| 'open_window_exists';

type AssignmentSnapshot = {
	id: string;
	status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled';
	userId: string | null;
	driverName: string | null;
	routeId: string;
	routeName: string;
	warehouseId: string;
	warehouseName: string;
	date: string;
	routeStartTime: string;
};

type OpenBidWindowSnapshot = {
	id: string;
	mode: 'competitive' | 'instant' | 'emergency';
	status: 'open' | 'closed' | 'resolved';
	closesAt: Date;
	payBonusPercent: number;
};

function overrideError(status: number, code: OverrideErrorCode, message: string) {
	return json(
		{
			code,
			message
		},
		{ status }
	);
}

function toBidWindowPayload(window: OpenBidWindowSnapshot | null) {
	if (!window) {
		return null;
	}

	return {
		id: window.id,
		mode: window.mode,
		status: window.status,
		closesAt: window.closesAt.toISOString(),
		payBonusPercent: window.payBonusPercent
	};
}

function hasShiftStarted(date: string, startTime: string): boolean {
	const { hours, minutes } = parseRouteStartTime(startTime);
	const shiftStart = getTorontoDateTimeInstant(date, { hours, minutes });
	return new Date() >= shiftStart;
}

async function getAssignmentSnapshot(assignmentId: string): Promise<AssignmentSnapshot | null> {
	const [assignment] = await db
		.select({
			id: assignments.id,
			status: assignments.status,
			userId: assignments.userId,
			driverName: user.name,
			routeId: assignments.routeId,
			routeName: routes.name,
			warehouseId: assignments.warehouseId,
			warehouseName: warehouses.name,
			date: assignments.date,
			routeStartTime: routes.startTime
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.leftJoin(user, eq(assignments.userId, user.id))
		.where(eq(assignments.id, assignmentId));

	return assignment ?? null;
}

async function getOpenBidWindow(assignmentId: string): Promise<OpenBidWindowSnapshot | null> {
	const [window] = await db
		.select({
			id: bidWindows.id,
			mode: bidWindows.mode,
			status: bidWindows.status,
			closesAt: bidWindows.closesAt,
			payBonusPercent: bidWindows.payBonusPercent
		})
		.from(bidWindows)
		.where(and(eq(bidWindows.assignmentId, assignmentId), eq(bidWindows.status, 'open')))
		.orderBy(desc(bidWindows.opensAt), desc(bidWindows.id))
		.limit(1);

	return window ?? null;
}

async function getBidWindowById(windowId: string): Promise<OpenBidWindowSnapshot | null> {
	const [window] = await db
		.select({
			id: bidWindows.id,
			mode: bidWindows.mode,
			status: bidWindows.status,
			closesAt: bidWindows.closesAt,
			payBonusPercent: bidWindows.payBonusPercent
		})
		.from(bidWindows)
		.where(eq(bidWindows.id, windowId))
		.limit(1);

	return window ?? null;
}

async function closeOpenWindowForUrgentEscalation(params: {
	assignmentId: string;
	bidWindowId: string;
	actorId: string;
	assignmentStatusBefore: AssignmentSnapshot['status'];
}) {
	const resolvedAt = new Date();

	const [closedWindow] = await db.transaction(async (tx) => {
		const [closed] = await tx
			.update(bidWindows)
			.set({
				status: 'closed',
				winnerId: null
			})
			.where(and(eq(bidWindows.id, params.bidWindowId), eq(bidWindows.status, 'open')))
			.returning({ id: bidWindows.id });

		if (!closed) {
			return [];
		}

		await tx
			.update(bids)
			.set({
				status: 'lost',
				resolvedAt
			})
			.where(and(eq(bids.bidWindowId, params.bidWindowId), eq(bids.status, 'pending')));

		await createAuditLog(
			{
				entityType: 'assignment',
				entityId: params.assignmentId,
				action: 'manager_override_escalate_urgent',
				actorType: 'user',
				actorId: params.actorId,
				changes: {
					before: {
						status: params.assignmentStatusBefore,
						bidWindowId: params.bidWindowId
					},
					after: {
						status: params.assignmentStatusBefore,
						closedBidWindowId: params.bidWindowId
					}
				}
			},
			tx
		);

		return [closed];
	});

	if (closedWindow) {
		broadcastBidWindowClosed({
			assignmentId: params.assignmentId,
			bidWindowId: closedWindow.id,
			winnerId: null,
			winnerName: null
		});
	}

	return Boolean(closedWindow);
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		return overrideError(403, 'forbidden', 'Only managers can override assignments');
	}

	const paramsResult = assignmentIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		return overrideError(400, 'validation_failed', 'Invalid assignment ID');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return overrideError(400, 'validation_failed', 'Invalid JSON body');
	}

	const parsed = assignmentOverrideSchema.safeParse(body);
	if (!parsed.success) {
		return overrideError(400, 'validation_failed', 'Validation failed');
	}

	const assignmentId = paramsResult.data.id;
	const assignment = await getAssignmentSnapshot(assignmentId);
	if (!assignment) {
		return overrideError(404, 'assignment_not_found', 'Assignment not found');
	}

	const hasWarehouseAccess = await canManagerAccessWarehouse(
		locals.user.id,
		assignment.warehouseId,
		locals.organizationId ?? locals.user.organizationId ?? ''
	);
	if (!hasWarehouseAccess) {
		return overrideError(403, 'forbidden', 'No access to this warehouse');
	}

	const openWindow = await getOpenBidWindow(assignmentId);

	if (parsed.data.action === 'reassign') {
		if (assignment.status !== 'scheduled' && assignment.status !== 'unfilled') {
			return overrideError(
				409,
				'invalid_assignment_state',
				'Reassign is only available for scheduled or unfilled assignments'
			);
		}

		const result = await manualAssignDriverToAssignment({
			assignmentId,
			driverId: parsed.data.driverId,
			actorId: locals.user.id,
			organizationId: locals.organizationId ?? locals.user.organizationId ?? '',
			allowedStatuses: ['scheduled', 'unfilled']
		});

		if (!result.ok) {
			if (result.code === 'assignment_not_found') {
				return overrideError(404, 'assignment_not_found', 'Assignment not found');
			}

			if (result.code === 'forbidden') {
				return overrideError(403, 'forbidden', 'No access to this warehouse');
			}

			if (result.code === 'assignment_not_assignable') {
				return overrideError(
					409,
					'invalid_assignment_state',
					'Assignment cannot be reassigned in its current state'
				);
			}

			if (result.code === 'driver_not_found') {
				return overrideError(400, 'validation_failed', 'Driver not found');
			}

			if (result.code === 'driver_flagged') {
				return overrideError(400, 'validation_failed', 'Flagged drivers cannot be assigned');
			}

			if (result.code === 'driver_over_weekly_cap') {
				return overrideError(400, 'validation_failed', 'Driver is at weekly assignment cap');
			}

			return overrideError(400, 'validation_failed', 'Unable to reassign assignment');
		}

		if (result.bidWindowId) {
			broadcastBidWindowClosed({
				assignmentId: result.assignmentId,
				bidWindowId: result.bidWindowId,
				winnerId: null,
				winnerName: null
			});
		}

		broadcastAssignmentUpdated({
			assignmentId: result.assignmentId,
			status: 'scheduled',
			driverId: result.driverId,
			driverName: result.driverName,
			routeId: result.routeId,
			bidWindowClosesAt: null
		});

		return json({
			action: parsed.data.action,
			assignment: {
				id: result.assignmentId,
				status: 'scheduled',
				userId: result.driverId,
				driverName: result.driverName,
				routeId: result.routeId
			},
			bidWindow: null,
			notifiedCount: null
		});
	}

	if (parsed.data.action === 'open_bidding') {
		if (assignment.status !== 'unfilled') {
			return overrideError(
				409,
				'invalid_assignment_state',
				'Open bidding is only available for unfilled assignments'
			);
		}

		if (openWindow) {
			return overrideError(409, 'open_window_exists', 'An open bid window already exists');
		}

		if (hasShiftStarted(assignment.date, assignment.routeStartTime)) {
			return overrideError(
				409,
				'invalid_assignment_state',
				'Open bidding is only available before the shift starts'
			);
		}

		const result = await createBidWindow(assignmentId, {
			organizationId: locals.organizationId ?? locals.user.organizationId ?? '',
			trigger: 'manager'
		});

		if (!result.success || !result.bidWindowId) {
			if (result.reason?.includes('Open bid window already exists')) {
				return overrideError(409, 'open_window_exists', 'An open bid window already exists');
			}

			return overrideError(
				409,
				'invalid_assignment_state',
				result.reason ?? 'Unable to open bidding for this assignment'
			);
		}

		const createdWindow = await getBidWindowById(result.bidWindowId);

		return json({
			action: parsed.data.action,
			assignment: {
				id: assignment.id,
				status: 'unfilled',
				userId: null,
				driverName: null,
				routeId: assignment.routeId
			},
			bidWindow: toBidWindowPayload(createdWindow),
			notifiedCount: result.notifiedCount ?? null
		});
	}

	if (assignment.status !== 'scheduled' && assignment.status !== 'unfilled') {
		return overrideError(
			409,
			'invalid_assignment_state',
			'Open urgent bidding is only available for scheduled or unfilled assignments'
		);
	}

	if (openWindow && openWindow.mode === 'emergency') {
		return json({
			action: parsed.data.action,
			assignment: {
				id: assignment.id,
				status: assignment.status,
				userId: assignment.userId,
				driverName: assignment.driverName,
				routeId: assignment.routeId
			},
			bidWindow: toBidWindowPayload(openWindow),
			notifiedCount: null
		});
	}

	if (openWindow && openWindow.mode !== 'emergency') {
		const closed = await closeOpenWindowForUrgentEscalation({
			assignmentId,
			bidWindowId: openWindow.id,
			actorId: locals.user.id,
			assignmentStatusBefore: assignment.status
		});

		if (!closed) {
			const refreshedWindow = await getOpenBidWindow(assignmentId);
			if (refreshedWindow && refreshedWindow.mode === 'emergency') {
				return json({
					action: parsed.data.action,
					assignment: {
						id: assignment.id,
						status: assignment.status,
						userId: assignment.userId,
						driverName: assignment.driverName,
						routeId: assignment.routeId
					},
					bidWindow: toBidWindowPayload(refreshedWindow),
					notifiedCount: null
				});
			}

			if (refreshedWindow) {
				return overrideError(409, 'open_window_exists', 'An open bid window already exists');
			}
		}
	}

	const emergencyBonusPercent = await getEmergencyBonusPercent(
		locals.organizationId ?? locals.user.organizationId ?? ''
	);
	const urgentResult = await createBidWindow(assignmentId, {
		organizationId: locals.organizationId ?? locals.user.organizationId ?? '',
		mode: 'emergency',
		trigger: 'manager',
		payBonusPercent: emergencyBonusPercent
	});

	if (!urgentResult.success || !urgentResult.bidWindowId) {
		if (urgentResult.reason?.includes('Open bid window already exists')) {
			const refreshedWindow = await getOpenBidWindow(assignmentId);
			if (refreshedWindow && refreshedWindow.mode === 'emergency') {
				return json({
					action: parsed.data.action,
					assignment: {
						id: assignment.id,
						status: assignment.status,
						userId: assignment.userId,
						driverName: assignment.driverName,
						routeId: assignment.routeId
					},
					bidWindow: toBidWindowPayload(refreshedWindow),
					notifiedCount: null
				});
			}

			return overrideError(409, 'open_window_exists', 'An open bid window already exists');
		}

		return overrideError(
			409,
			'invalid_assignment_state',
			urgentResult.reason ?? 'Unable to open urgent bidding for this assignment'
		);
	}

	const urgentWindow = await getBidWindowById(urgentResult.bidWindowId);

	return json({
		action: parsed.data.action,
		assignment: {
			id: assignment.id,
			status: 'unfilled',
			userId: null,
			driverName: null,
			routeId: assignment.routeId
		},
		bidWindow: toBidWindowPayload(urgentWindow),
		notifiedCount: urgentResult.notifiedCount ?? null
	});
};
