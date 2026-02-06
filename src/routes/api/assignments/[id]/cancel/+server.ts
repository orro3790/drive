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
import { and, eq, sql } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';
import { sendManagerAlert } from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import { createBidWindow } from '$lib/server/services/bidding';
import { calculateConfirmationDeadline } from '$lib/server/services/confirmations';
import { broadcastAssignmentUpdated } from '$lib/server/realtime/managerSse';

const TORONTO_TZ = 'America/Toronto';

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

	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const torontoToday = format(torontoNow, 'yyyy-MM-dd');
	if (existing.date <= torontoToday) {
		throw error(400, 'Assignments must be cancelled in advance');
	}

	// Check for late cancellation: confirmed + past 48h deadline
	const { deadline } = calculateConfirmationDeadline(existing.date);
	const isLateCancellation = existing.confirmedAt !== null && torontoNow > deadline;

	// Cancel the assignment
	const [updated] = await db
		.update(assignments)
		.set({
			status: 'cancelled',
			updatedAt: new Date()
		})
		.where(and(eq(assignments.id, id), eq(assignments.userId, locals.user.id)))
		.returning({
			id: assignments.id,
			status: assignments.status
		});

	// Increment late cancellation metric if applicable
	if (isLateCancellation) {
		await db
			.update(driverMetrics)
			.set({
				lateCancellations: sql`${driverMetrics.lateCancellations} + 1`,
				updatedAt: new Date()
			})
			.where(eq(driverMetrics.userId, locals.user.id));
	}

	await createAuditLog({
		entityType: 'assignment',
		entityId: existing.id,
		action: 'cancel',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before: { status: existing.status },
			after: { status: updated.status },
			reason: result.data.reason,
			lateCancel: isLateCancellation,
			trigger: 'cancellation'
		}
	});

	// Send alert to route manager (best-effort)
	try {
		await sendManagerAlert(existing.routeId, 'route_cancelled', {
			driverName: locals.user.name ?? 'A driver',
			date: existing.date
		});
	} catch {
		// Manager alert is best-effort
	}

	// Create bid window via service (handles mode selection automatically)
	await createBidWindow(existing.id, { trigger: 'cancellation' });

	broadcastAssignmentUpdated({
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
