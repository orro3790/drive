/**
 * Shift Arrive API
 *
 * POST /api/shifts/arrive - Signal on-site arrival for today's assignment
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, driverMetrics, routes, shifts } from '$lib/server/db/schema';
import { shiftArriveSchema } from '$lib/schemas/shift';
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';
import {
	calculateArrivalDeadline,
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';
import logger from '$lib/server/logger';
import { requireDriverWithOrg } from '$lib/server/org-scope';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, organizationId } = requireDriverWithOrg(locals);

	const body = await request.json();
	const result = shiftArriveSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { assignmentId } = result.data;

	// Get assignment with route start time
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt,
			routeStartTime: routes.startTime
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
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
	const existingShiftArrivedAt = existingShift?.arrivedAt ?? null;
	const existingShiftParcelsStart = existingShift?.parcelsStart ?? null;
	const existingShiftCompletedAt = existingShift?.completedAt ?? null;

	const lifecycleContext = createAssignmentLifecycleContext();

	if (assignment.date !== lifecycleContext.torontoToday) {
		throw error(400, "Arrival can only be recorded for today's shift");
	}

	if (assignment.confirmedAt === null) {
		throw error(400, 'Assignment must be confirmed before arrival');
	}

	if (existingShift) {
		throw error(409, 'Already arrived');
	}

	const arrivedAt = new Date();
	const arrivalDeadline = calculateArrivalDeadline(
		assignment.date,
		undefined,
		assignment.routeStartTime
	);

	if (arrivedAt >= arrivalDeadline) {
		const startTime = assignment.routeStartTime ?? '09:00';
		throw error(400, `Arrival cutoff is ${startTime} Toronto time`);
	}

	const lifecycle = deriveAssignmentLifecycle(
		{
			assignmentDate: assignment.date,
			assignmentStatus: assignment.status,
			confirmedAt: assignment.confirmedAt,
			shiftArrivedAt: existingShiftArrivedAt,
			parcelsStart: existingShiftParcelsStart,
			shiftCompletedAt: existingShiftCompletedAt,
			routeStartTime: assignment.routeStartTime
		},
		lifecycleContext
	);

	if (!lifecycle.isArrivable) {
		throw error(409, 'Assignment is not ready for arrival');
	}

	const userId = user.id;
	const log = logger.child({ operation: 'shiftArrive', assignmentId, userId });
	log.info('Starting shift arrival');

	let shift: { id: string; arrivedAt: Date | null };
	try {
		shift = await db.transaction(async (tx) => {
			// Create shift record
			const [inserted] = await tx
				.insert(shifts)
				.values({
					assignmentId,
					arrivedAt
				})
				.returning({
					id: shifts.id,
					arrivedAt: shifts.arrivedAt
				});

			// Check if arrived before deadline → increment arrivedOnTimeCount
			if (arrivedAt < arrivalDeadline) {
				await tx
					.update(driverMetrics)
					.set({
						arrivedOnTimeCount: sql`${driverMetrics.arrivedOnTimeCount} + 1`,
						updatedAt: new Date()
					})
					.where(eq(driverMetrics.userId, userId));
			}

			// Update assignment status to active
			await tx
				.update(assignments)
				.set({
					status: 'active',
					updatedAt: new Date()
				})
				.where(eq(assignments.id, assignmentId));

			await createAuditLog(
				{
					entityType: 'shift',
					entityId: inserted.id,
					action: 'arrive',
					actorType: 'user',
					actorId: userId,
					changes: { assignmentId, arrivedAt: arrivedAt.toISOString() }
				},
				tx
			);

			return inserted;
		});
	} catch (err: unknown) {
		// Unique constraint on shifts.assignmentId — concurrent arrive
		if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
			throw error(409, 'Already arrived');
		}
		throw err;
	}

	log.info({ shiftId: shift.id }, 'Shift arrival recorded');

	broadcastAssignmentUpdated(organizationId, {
		assignmentId,
		status: 'active',
		driverId: user.id,
		driverName: user.name ?? null,
		shiftProgress: 'arrived'
	});

	return json({
		success: true,
		arrivedAt: arrivedAt.toISOString()
	});
};
