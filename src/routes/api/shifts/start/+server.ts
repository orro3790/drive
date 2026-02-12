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
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';
import { requireDriverWithOrg } from '$lib/server/org-scope';
import {
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';
import logger from '$lib/server/logger';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, organizationId } = requireDriverWithOrg(locals);

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
			status: assignments.status,
			confirmedAt: assignments.confirmedAt
		})
		.from(assignments)
		.where(eq(assignments.id, assignmentId));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	// Verify ownership
	if (assignment.userId !== user.id) {
		throw error(403, 'Forbidden');
	}

	// Check for any incomplete shift by this driver (arrived but not completed)
	const [incompleteShift] = await db
		.select({ id: shifts.id, assignmentId: shifts.assignmentId })
		.from(shifts)
		.innerJoin(assignments, eq(shifts.assignmentId, assignments.id))
		.where(
			and(
				eq(assignments.userId, user.id),
				inArray(assignments.status, ['active', 'scheduled']),
				isNotNull(shifts.arrivedAt),
				isNull(shifts.completedAt),
				isNull(shifts.cancelledAt)
			)
		)
		.limit(1);

	if (incompleteShift && incompleteShift.assignmentId !== assignmentId) {
		throw error(409, 'You have an incomplete shift that must be closed out first');
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
			parcelsStart: shifts.parcelsStart,
			completedAt: shifts.completedAt
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (!shift) {
		throw error(404, 'Shift not found — arrive first');
	}

	const lifecycleContext = createAssignmentLifecycleContext();
	const lifecycle = deriveAssignmentLifecycle(
		{
			assignmentDate: assignment.date,
			assignmentStatus: assignment.status,
			confirmedAt: assignment.confirmedAt,
			shiftArrivedAt: shift.arrivedAt,
			parcelsStart: shift.parcelsStart,
			shiftCompletedAt: shift.completedAt
		},
		lifecycleContext
	);

	if (!lifecycle.isStartable) {
		throw error(409, 'Assignment is not ready to start');
	}

	if (!shift.arrivedAt) {
		throw error(409, 'Must arrive before starting inventory');
	}

	if (shift.parcelsStart !== null) {
		throw error(409, 'Parcel inventory already recorded');
	}

	const userId = user.id;
	const log = logger.child({ operation: 'shiftStart', assignmentId, userId });
	log.info('Starting parcel inventory recording');

	const updatedShift = await db.transaction(async (tx) => {
		// Update shift with parcels and start time — WHERE guard prevents double-start
		const [updated] = await tx
			.update(shifts)
			.set({
				parcelsStart,
				startedAt: new Date()
			})
			.where(and(eq(shifts.id, shift.id), isNull(shifts.parcelsStart)))
			.returning({
				id: shifts.id,
				parcelsStart: shifts.parcelsStart,
				startedAt: shifts.startedAt
			});

		if (!updated) {
			throw error(409, 'Parcel inventory already recorded');
		}

		await createAuditLog(
			{
				entityType: 'shift',
				entityId: shift.id,
				action: 'start',
				actorType: 'user',
				actorId: userId,
				changes: { parcelsStart, assignmentId }
			},
			tx
		);

		return updated;
	});

	log.info({ shiftId: updatedShift.id }, 'Parcel inventory recorded');

	broadcastAssignmentUpdated(organizationId, {
		assignmentId,
		status: 'active',
		driverId: user.id,
		driverName: user.name ?? null,
		shiftProgress: 'started'
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
