/**
 * Assignment Cancellation API
 *
 * POST /api/assignments/[id]/cancel - Cancel an assignment (driver only)
 *
 * Late cancellation: if the assignment was confirmed and the driver cancels
 * within 48h of the shift, the lateCancellations metric is incremented.
 * A bid window is created with mode based on time remaining.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, driverMetrics } from '$lib/server/db/schema';
import { assignmentCancelSchema } from '$lib/schemas/assignment';
import { and, eq, ne, sql } from 'drizzle-orm';
import { sendManagerAlert } from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import { createBidWindow } from '$lib/server/services/bidding';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';
import {
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';
import logger from '$lib/server/logger';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can cancel assignments');
	}

	const { id } = params;
	const body = await request.json();
	const result = assignmentCancelSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const [existing] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			routeId: assignments.routeId,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt
		})
		.from(assignments)
		.where(eq(assignments.id, id));

	if (!existing) {
		throw error(404, 'Assignment not found');
	}

	if (existing.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	if (existing.status === 'cancelled') {
		throw error(409, 'Assignment already cancelled');
	}

	const lifecycleContext = createAssignmentLifecycleContext();
	const lifecycle = deriveAssignmentLifecycle(
		{
			assignmentDate: existing.date,
			assignmentStatus: existing.status,
			confirmedAt: existing.confirmedAt,
			shiftArrivedAt: null,
			parcelsStart: null,
			shiftCompletedAt: null
		},
		lifecycleContext
	);

	if (!lifecycle.isCancelable) {
		throw error(400, 'Assignments must be cancelled in advance');
	}

	// Check for late cancellation using lifecycle contract boundaries
	const isLateCancellation = existing.confirmedAt !== null && lifecycle.isLateCancel;
	const cancelledAt = new Date();

	const userId = locals.user.id;
	const organizationId = locals.organizationId ?? locals.user.organizationId ?? '';
	const log = logger.child({ operation: 'assignmentCancel', assignmentId: id, userId });
	log.info({ isLateCancellation }, 'Starting assignment cancellation');

	const updated = await db.transaction(async (tx) => {
		// Cancel the assignment — WHERE guard prevents double-cancel
		const [row] = await tx
			.update(assignments)
			.set({
				status: 'cancelled',
				cancelType: isLateCancellation ? 'late' : 'driver',
				cancelledAt,
				updatedAt: cancelledAt
			})
			.where(
				and(
					eq(assignments.id, id),
					eq(assignments.userId, userId),
					ne(assignments.status, 'cancelled')
				)
			)
			.returning({
				id: assignments.id,
				status: assignments.status
			});

		if (!row) {
			throw error(409, 'Assignment already cancelled');
		}

		// Increment late cancellation metric if applicable
		if (isLateCancellation) {
			await tx
				.update(driverMetrics)
				.set({
					lateCancellations: sql`${driverMetrics.lateCancellations} + 1`,
					updatedAt: new Date()
				})
				.where(eq(driverMetrics.userId, userId));
		}

		await createAuditLog(
			{
				entityType: 'assignment',
				entityId: existing.id,
				action: 'cancel',
				actorType: 'user',
				actorId: userId,
				changes: {
					before: { status: existing.status },
					after: { status: row.status },
					reason: result.data.reason,
					lateCancel: isLateCancellation,
					trigger: 'cancellation'
				}
			},
			tx
		);

		return row;
	});

	log.info({ assignmentId: updated.id }, 'Assignment cancelled');

	// Send alert to route manager (best-effort)
	try {
		await sendManagerAlert(
			existing.routeId,
			'route_cancelled',
			{
				driverName: locals.user.name ?? 'A driver',
				date: existing.date
			},
			organizationId
		);
	} catch {
		// Manager alert is best-effort
	}

	// Create bid window via service (handles mode selection automatically)
	await createBidWindow(existing.id, {
		organizationId,
		trigger: 'cancellation'
	});

	broadcastAssignmentUpdated(organizationId, {
		assignmentId: existing.id,
		status: 'cancelled',
		driverId: locals.user.id,
		driverName: locals.user.name ?? null,
		routeId: existing.routeId
	});

	return json({
		assignment: updated
	});
};
