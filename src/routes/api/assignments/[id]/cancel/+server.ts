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
import { assignments, driverMetrics, routes } from '$lib/server/db/schema';
import { assignmentCancelSchema, assignmentIdParamsSchema } from '$lib/schemas/assignment';
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
import { requireDriverWithOrg } from '$lib/server/org-scope';

const OPEN_WINDOW_EXISTS_REASON = 'Open bid window already exists for this assignment';

type ReplacementWindowStatus = 'created' | 'already_open' | 'not_created';

interface ReplacementWindowResult {
	status: ReplacementWindowStatus;
	bidWindowId: string | null;
	reason: string | null;
}

async function ensureReplacementBidWindow(
	assignmentId: string,
	organizationId: string,
	log: {
		error: (object: Record<string, unknown>, msg?: string, ...args: unknown[]) => void;
	}
): Promise<ReplacementWindowResult> {
	try {
		const result = await createBidWindow(assignmentId, {
			organizationId,
			trigger: 'cancellation'
		});

		if (result.success) {
			return {
				status: 'created',
				bidWindowId: result.bidWindowId ?? null,
				reason: null
			};
		}

		if (result.reason?.includes(OPEN_WINDOW_EXISTS_REASON)) {
			return {
				status: 'already_open',
				bidWindowId: null,
				reason: result.reason
			};
		}

		return {
			status: 'not_created',
			bidWindowId: null,
			reason: result.reason ?? 'Unable to create replacement bid window'
		};
	} catch (err) {
		const reason =
			err instanceof Error && err.message.trim().length > 0 ? err.message : String(err);
		log.error({ assignmentId, error: err }, 'Failed to create replacement bid window');
		return {
			status: 'not_created',
			bidWindowId: null,
			reason
		};
	}
}

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user, organizationId } = requireDriverWithOrg(locals);
	const userId = user.id;
	const paramsResult = assignmentIdParamsSchema.safeParse(params);

	if (!paramsResult.success) {
		throw error(400, 'Invalid assignment ID');
	}

	const { id } = paramsResult.data;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	const result = assignmentCancelSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const [existing] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			routeId: assignments.routeId,
			routeName: routes.name,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt,
			routeStartTime: routes.startTime
		})
		.from(assignments)
		.leftJoin(routes, eq(routes.id, assignments.routeId))
		.where(eq(assignments.id, id));

	if (!existing) {
		throw error(404, 'Assignment not found');
	}

	if (existing.userId !== user.id) {
		throw error(403, 'Forbidden');
	}

	const log = logger.child({ operation: 'assignmentCancel', assignmentId: id, userId });

	if (existing.status === 'cancelled') {
		const replacementWindow = await ensureReplacementBidWindow(existing.id, organizationId, log);
		log.info(
			{ assignmentId: existing.id, replacementWindowStatus: replacementWindow.status },
			'Assignment cancellation replay handled'
		);
		return json({
			assignment: {
				id: existing.id,
				status: existing.status
			},
			alreadyCancelled: true,
			replacementWindow
		});
	}

	const lifecycleContext = createAssignmentLifecycleContext();
	const lifecycle = deriveAssignmentLifecycle(
		{
			assignmentDate: existing.date,
			assignmentStatus: existing.status,
			confirmedAt: existing.confirmedAt,
			shiftArrivedAt: null,
			parcelsStart: null,
			shiftCompletedAt: null,
			routeStartTime: existing.routeStartTime
		},
		lifecycleContext
	);

	if (!lifecycle.isCancelable) {
		throw error(400, 'Assignments must be cancelled in advance');
	}

	// Check for late cancellation using lifecycle contract boundaries
	const isLateCancellation = existing.confirmedAt !== null && lifecycle.isLateCancel;
	const cancelledAt = new Date();
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
				routeName: existing.routeName ?? undefined,
				driverName: user.name ?? 'A driver',
				date: existing.date,
				routeStartTime: existing.routeStartTime ?? undefined
			},
			organizationId
		);
	} catch (err) {
		log.warn(
			{ assignmentId: existing.id, error: err },
			'Failed to send manager cancellation alert'
		);
	}

	const replacementWindow = await ensureReplacementBidWindow(existing.id, organizationId, log);

	if (replacementWindow.status === 'not_created') {
		log.warn(
			{ assignmentId: existing.id, replacementWindowReason: replacementWindow.reason },
			'Assignment cancelled without replacement bid window'
		);
	}

	broadcastAssignmentUpdated(organizationId, {
		assignmentId: existing.id,
		status: 'cancelled',
		driverId: user.id,
		driverName: user.name ?? null,
		routeId: existing.routeId
	});

	log.info(
		{ assignmentId: updated.id, replacementWindowStatus: replacementWindow.status },
		'Assignment cancelled'
	);

	return json({
		assignment: updated,
		replacementWindow
	});
};
