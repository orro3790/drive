/**
 * Shift Complete API
 *
 * POST /api/shifts/complete - Complete an active shift
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, driverMetrics, routes, shifts } from '$lib/server/db/schema';
import { recordRouteCompletion, updateDriverMetrics } from '$lib/server/services/metrics';
import { shiftCompleteSchema } from '$lib/schemas/shift';
import { eq, sql } from 'drizzle-orm';
import { addHours } from 'date-fns';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';
import { sendManagerAlert } from '$lib/server/services/notifications';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import {
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can complete shifts');
	}

	const body = await request.json();
	const result = shiftCompleteSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { assignmentId, parcelsReturned, exceptedReturns, exceptionNotes } = result.data;

	// Get assignment with route info
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			routeId: assignments.routeId,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt,
			routeName: routes.name,
			routeStartTime: routes.startTime
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.where(eq(assignments.id, assignmentId));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	if (!assignment.userId) {
		throw error(409, 'Assignment has no assigned driver');
	}

	// Verify ownership
	if (assignment.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Check assignment is active
	if (assignment.status !== 'active') {
		throw error(409, 'Assignment is not active');
	}

	// Get shift record
	const [shift] = await db
		.select({
			id: shifts.id,
			arrivedAt: shifts.arrivedAt,
			parcelsStart: shifts.parcelsStart,
			completedAt: shifts.completedAt
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (!shift) {
		throw error(404, 'Shift not found — start shift first');
	}

	const lifecycleContext = createAssignmentLifecycleContext();
	const lifecycle = deriveAssignmentLifecycle(
		{
			assignmentDate: assignment.date,
			assignmentStatus: assignment.status,
			confirmedAt: assignment.confirmedAt,
			shiftArrivedAt: shift.arrivedAt,
			parcelsStart: shift.parcelsStart,
			shiftCompletedAt: shift.completedAt,
			routeStartTime: assignment.routeStartTime
		},
		lifecycleContext
	);

	if (!lifecycle.isCompletable) {
		throw error(409, 'Assignment is not ready to complete');
	}

	if (shift.completedAt) {
		throw error(409, 'Shift already completed');
	}

	if (shift.parcelsStart === null) {
		throw error(409, 'Parcel inventory not recorded — start shift first');
	}

	// Validate returns don't exceed start count
	if (parcelsReturned > shift.parcelsStart) {
		throw error(400, 'Returns cannot exceed starting parcels');
	}

	// Server-calculated delivered count
	const parcelsDelivered = shift.parcelsStart - parcelsReturned;
	const completedAt = new Date();
	const editableUntil = addHours(completedAt, dispatchPolicy.shifts.completionEditWindowHours);

	// Update shift record
	const [updatedShift] = await db
		.update(shifts)
		.set({
			parcelsDelivered,
			parcelsReturned,
			exceptedReturns,
			exceptionNotes: exceptionNotes ?? null,
			completedAt,
			editableUntil
		})
		.where(eq(shifts.id, shift.id))
		.returning({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			exceptedReturns: shifts.exceptedReturns,
			exceptionNotes: shifts.exceptionNotes,
			startedAt: shifts.startedAt,
			completedAt: shifts.completedAt,
			editableUntil: shifts.editableUntil
		});

	// Check if high delivery (95%+) using adjusted rate (excludes excepted returns)
	const adjustedDelivered = parcelsDelivered + exceptedReturns;
	if (shift.parcelsStart > 0 && adjustedDelivered / shift.parcelsStart >= 0.95) {
		await db
			.update(driverMetrics)
			.set({
				highDeliveryCount: sql`${driverMetrics.highDeliveryCount} + 1`,
				updatedAt: new Date()
			})
			.where(eq(driverMetrics.userId, locals.user.id));
	}

	// Notify manager if exceptions were filed
	if (exceptedReturns > 0) {
		await sendManagerAlert(assignment.routeId, 'return_exception', {
			routeName: assignment.routeName ?? 'Unknown Route',
			driverName: locals.user.name ?? 'A driver',
			date: assignment.date
		});
	}

	// Update assignment status to completed
	await db
		.update(assignments)
		.set({
			status: 'completed',
			updatedAt: new Date()
		})
		.where(eq(assignments.id, assignmentId));

	broadcastAssignmentUpdated({
		assignmentId,
		status: 'completed',
		driverId: assignment.userId,
		routeId: assignment.routeId
	});

	await createAuditLog({
		entityType: 'assignment',
		entityId: assignmentId,
		action: 'complete',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before: { status: assignment.status },
			after: { status: 'completed' }
		}
	});

	await createAuditLog({
		entityType: 'shift',
		entityId: shift.id,
		action: 'complete',
		actorType: 'user',
		actorId: locals.user.id,
		changes: { parcelsDelivered, parcelsReturned, exceptedReturns, exceptionNotes, assignmentId }
	});

	await Promise.all([
		recordRouteCompletion({
			userId: assignment.userId,
			routeId: assignment.routeId,
			completedAt
		}),
		updateDriverMetrics(assignment.userId)
	]);

	return json({
		shift: updatedShift,
		assignmentStatus: 'completed'
	});
};
