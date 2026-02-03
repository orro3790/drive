/**
 * Shift Complete API
 *
 * POST /api/shifts/complete - Complete an active shift
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, shifts, auditLogs } from '$lib/server/db/schema';
import { recordRouteCompletion, updateDriverMetrics } from '$lib/server/services/metrics';
import { shiftCompleteSchema } from '$lib/schemas/shift';
import { eq } from 'drizzle-orm';
import logger from '$lib/server/logger';

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

	const { assignmentId, parcelsDelivered, parcelsReturned } = result.data;

	// Get assignment with shift
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			routeId: assignments.routeId,
			status: assignments.status
		})
		.from(assignments)
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
			parcelsStart: shifts.parcelsStart,
			completedAt: shifts.completedAt
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (!shift) {
		throw error(404, 'Shift not found - start shift first');
	}

	if (shift.completedAt) {
		throw error(409, 'Shift already completed');
	}

	// Warn if parcels don't add up (but allow it)
	const totalAfter = parcelsDelivered + parcelsReturned;
	if (shift.parcelsStart !== null && totalAfter > shift.parcelsStart) {
		logger.warn(
			{
				shiftId: shift.id,
				parcelsStart: shift.parcelsStart,
				parcelsDelivered,
				parcelsReturned,
				total: totalAfter
			},
			'Parcel count exceeds start count'
		);
	}

	const completedAt = new Date();

	// Update shift record
	const [updatedShift] = await db
		.update(shifts)
		.set({
			parcelsDelivered,
			parcelsReturned,
			completedAt
		})
		.where(eq(shifts.id, shift.id))
		.returning({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			startedAt: shifts.startedAt,
			completedAt: shifts.completedAt
		});

	// Update assignment status to completed
	await db
		.update(assignments)
		.set({
			status: 'completed',
			updatedAt: new Date()
		})
		.where(eq(assignments.id, assignmentId));

	// Audit log
	await db.insert(auditLogs).values({
		entityType: 'shift',
		entityId: shift.id,
		action: 'complete',
		actorType: 'user',
		actorId: locals.user.id,
		changes: { parcelsDelivered, parcelsReturned }
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
