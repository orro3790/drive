import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assignmentIdParamsSchema, assignmentManualAssignSchema } from '$lib/schemas/assignment';
import { manualAssignDriverToAssignment } from '$lib/server/services/assignments';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed
} from '$lib/server/realtime/managerSse';
import { requireManagerWithOrg } from '$lib/server/org-scope';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	const paramsResult = assignmentIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid assignment ID');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = assignmentManualAssignSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Validation failed');
	}

	const result = await manualAssignDriverToAssignment({
		assignmentId: paramsResult.data.id,
		driverId: parsed.data.userId,
		actorId: manager.id,
		organizationId
	});

	if (!result.ok) {
		if (result.code === 'assignment_not_found') {
			throw error(404, 'Assignment not found');
		}
		if (result.code === 'forbidden') {
			throw error(403, 'No access to this warehouse');
		}
		if (result.code === 'assignment_not_assignable') {
			throw error(409, 'Assignment must be unfilled to assign manually');
		}
		if (result.code === 'driver_not_found') {
			throw error(400, 'Driver not found');
		}
		if (result.code === 'driver_flagged') {
			throw error(400, 'Flagged drivers cannot be assigned');
		}
		if (result.code === 'driver_over_weekly_cap') {
			throw error(400, 'Driver is at weekly assignment cap');
		}
		throw error(500, 'Unable to assign driver');
	}

	if (result.bidWindowId) {
		broadcastBidWindowClosed(organizationId, {
			assignmentId: result.assignmentId,
			bidWindowId: result.bidWindowId,
			winnerId: null,
			winnerName: null
		});
	}

	broadcastAssignmentUpdated(organizationId, {
		assignmentId: result.assignmentId,
		status: 'scheduled',
		driverId: result.driverId,
		driverName: result.driverName,
		routeId: result.routeId,
		bidWindowClosesAt: null
	});

	return json({
		assignment: {
			id: result.assignmentId,
			routeId: result.routeId,
			routeName: result.routeName,
			date: result.assignmentDate,
			status: 'scheduled',
			userId: result.driverId,
			driverName: result.driverName
		},
		bidWindowId: result.bidWindowId
	});
};
