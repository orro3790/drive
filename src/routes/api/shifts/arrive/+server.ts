/**
 * Shift Arrive API
 *
 * POST /api/shifts/arrive - Signal on-site arrival for today's assignment
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, shifts } from '$lib/server/db/schema';
import { shiftArriveSchema } from '$lib/schemas/shift';
import { eq } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can signal arrival');
	}

	const body = await request.json();
	const result = shiftArriveSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { assignmentId } = result.data;

	// Get assignment
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt
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

	// Check date is today (Toronto time)
	const torontoNow = toZonedTime(new Date(), dispatchPolicy.timezone.toronto);
	const torontoToday = format(torontoNow, 'yyyy-MM-dd');

	if (assignment.date !== torontoToday) {
		throw error(400, 'Can only arrive on the assignment date');
	}

	// Check assignment status
	if (assignment.status !== 'scheduled') {
		throw error(400, 'Assignment is not in scheduled status');
	}

	// Must be confirmed first
	if (!assignment.confirmedAt) {
		throw error(400, 'Assignment must be confirmed before arrival');
	}

	// Check time: must be before 9 AM Toronto time
	if (torontoNow.getHours() >= dispatchPolicy.shifts.arrivalDeadlineHourLocal) {
		throw error(400, 'Must arrive before 9:00 AM');
	}

	// Check for existing shift (already arrived)
	const [existingShift] = await db
		.select({ id: shifts.id })
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (existingShift) {
		throw error(409, 'Already arrived');
	}

	const arrivedAt = new Date();

	// Create shift record
	const [shift] = await db
		.insert(shifts)
		.values({
			assignmentId,
			arrivedAt
		})
		.returning({
			id: shifts.id,
			arrivedAt: shifts.arrivedAt
		});

	// Update assignment status to active
	await db
		.update(assignments)
		.set({
			status: 'active',
			updatedAt: new Date()
		})
		.where(eq(assignments.id, assignmentId));

	broadcastAssignmentUpdated({
		assignmentId,
		status: 'active',
		driverId: locals.user.id,
		driverName: locals.user.name ?? null
	});

	await createAuditLog({
		entityType: 'shift',
		entityId: shift.id,
		action: 'arrive',
		actorType: 'user',
		actorId: locals.user.id,
		changes: { assignmentId, arrivedAt: arrivedAt.toISOString() }
	});

	return json({
		success: true,
		arrivedAt: arrivedAt.toISOString()
	});
};
