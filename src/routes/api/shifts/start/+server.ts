/**
 * Shift Start API
 *
 * POST /api/shifts/start - Record parcel inventory for an arrived shift
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, shifts } from '$lib/server/db/schema';
import { shiftStartSchema } from '$lib/schemas/shift';
import { eq } from 'drizzle-orm';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can start shifts');
	}

	const body = await request.json();
	const result = shiftStartSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { assignmentId, parcelsStart } = result.data;

	// Get assignment
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			status: assignments.status
		})
		.from(assignments)
		.where(eq(assignments.id, assignmentId));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	// Verify ownership
	if (assignment.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Assignment must be active (set by arrive endpoint)
	if (assignment.status !== 'active') {
		throw error(409, 'Assignment is not active — arrive first');
	}

	// Get existing shift record (created by arrive endpoint)
	const [shift] = await db
		.select({
			id: shifts.id,
			arrivedAt: shifts.arrivedAt,
			parcelsStart: shifts.parcelsStart
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (!shift) {
		throw error(404, 'Shift not found — arrive first');
	}

	if (!shift.arrivedAt) {
		throw error(409, 'Must arrive before starting inventory');
	}

	if (shift.parcelsStart !== null) {
		throw error(409, 'Parcel inventory already recorded');
	}

	// Update shift with parcels and start time
	const [updatedShift] = await db
		.update(shifts)
		.set({
			parcelsStart,
			startedAt: new Date()
		})
		.where(eq(shifts.id, shift.id))
		.returning({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			startedAt: shifts.startedAt
		});

	broadcastAssignmentUpdated({
		assignmentId,
		status: 'active',
		driverId: locals.user.id,
		driverName: locals.user.name ?? null
	});

	await createAuditLog({
		entityType: 'shift',
		entityId: shift.id,
		action: 'start',
		actorType: 'user',
		actorId: locals.user.id,
		changes: { parcelsStart, assignmentId }
	});

	return json({
		shift: {
			id: updatedShift.id,
			parcelsStart: updatedShift.parcelsStart,
			startedAt: updatedShift.startedAt
		},
		assignmentStatus: 'active'
	});
};
