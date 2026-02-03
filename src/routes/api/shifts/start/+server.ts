/**
 * Shift Start API
 *
 * POST /api/shifts/start - Start a shift for today's assignment
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, shifts, auditLogs } from '$lib/server/db/schema';
import { shiftStartSchema } from '$lib/schemas/shift';
import { eq, and } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';

const TORONTO_TZ = 'America/Toronto';

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
			date: assignments.date,
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

	// Check date is today (Toronto time)
	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const torontoToday = format(torontoNow, 'yyyy-MM-dd');

	if (assignment.date !== torontoToday) {
		throw error(400, 'Can only start shifts on the assignment date');
	}

	// Check assignment status
	if (assignment.status !== 'scheduled') {
		throw error(409, 'Assignment is not in scheduled status');
	}

	// Check for existing shift
	const [existingShift] = await db
		.select({ id: shifts.id })
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (existingShift) {
		throw error(409, 'Shift already started');
	}

	// Create shift record
	const [shift] = await db
		.insert(shifts)
		.values({
			assignmentId,
			parcelsStart,
			startedAt: new Date()
		})
		.returning({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			startedAt: shifts.startedAt
		});

	// Update assignment status to active
	await db
		.update(assignments)
		.set({
			status: 'active',
			updatedAt: new Date()
		})
		.where(eq(assignments.id, assignmentId));

	// Audit log
	await db.insert(auditLogs).values({
		entityType: 'shift',
		entityId: shift.id,
		action: 'start',
		actorType: 'user',
		actorId: locals.user.id,
		changes: { parcelsStart }
	});

	return json({
		shift: {
			id: shift.id,
			parcelsStart: shift.parcelsStart,
			startedAt: shift.startedAt
		},
		assignmentStatus: 'active'
	});
};
