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
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';
import {
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';

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

	// Check for existing shift record
	const [existingShift] = await db
		.select({
			id: shifts.id,
			arrivedAt: shifts.arrivedAt,
			parcelsStart: shifts.parcelsStart,
			completedAt: shifts.completedAt
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	const lifecycleContext = createAssignmentLifecycleContext();
	const lifecycle = deriveAssignmentLifecycle(
		{
			assignmentDate: assignment.date,
			assignmentStatus: assignment.status,
			confirmedAt: assignment.confirmedAt,
			shiftArrivedAt: existingShift?.arrivedAt ?? null,
			parcelsStart: existingShift?.parcelsStart ?? null,
			shiftCompletedAt: existingShift?.completedAt ?? null
		},
		lifecycleContext
	);

	if (!lifecycle.isArrivable) {
		throw error(409, 'Assignment is not ready for arrival');
	}

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
