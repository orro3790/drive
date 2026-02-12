/**
 * Bid Window Close API
 *
 * POST /api/bid-windows/[id]/close - Close a bid window immediately
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, bidWindows, bids, routes, warehouses } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import {
	getBidWindowDetail,
	resolveBidWindow,
	type ResolveBidWindowResult
} from '$lib/server/services/bidding';
import { bidWindowIdParamsSchema } from '$lib/schemas/api/bidding';
import { createAuditLog } from '$lib/server/services/audit';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed
} from '$lib/server/realtime/managerSse';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const actorId = locals.user.id;

	const paramsResult = bidWindowIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid bid window ID');
	}

	const windowId = paramsResult.data.id;

	const [window] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			status: bidWindows.status,
			assignmentStatus: assignments.status,
			assignmentUserId: assignments.userId,
			assignmentDate: assignments.date,
			routeId: assignments.routeId,
			routeName: routes.name,
			warehouseId: assignments.warehouseId
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(eq(bidWindows.id, windowId));

	if (!window) {
		throw error(404, 'Bid window not found');
	}

	const canAccess = await canManagerAccessWarehouse(
		actorId,
		window.warehouseId,
		locals.organizationId ?? locals.user.organizationId ?? ''
	);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

	if (window.status !== 'open') {
		throw error(409, 'Bid window already closed');
	}

	const pendingBids = await db
		.select({ id: bids.id })
		.from(bids)
		.where(and(eq(bids.bidWindowId, window.id), eq(bids.status, 'pending')));

	const closedAt = new Date();
	let resolvedResult: ResolveBidWindowResult | null = null;

	if (pendingBids.length === 0) {
		await db.transaction(async (tx) => {
			const [closedWindow] = await tx
				.update(bidWindows)
				.set({ status: 'closed', winnerId: null })
				.where(and(eq(bidWindows.id, window.id), eq(bidWindows.status, 'open')))
				.returning({ id: bidWindows.id });

			if (!closedWindow) {
				throw error(409, 'Bid window already closed');
			}

			await tx
				.update(assignments)
				.set({ status: 'unfilled', userId: null, updatedAt: closedAt })
				.where(eq(assignments.id, window.assignmentId));

			await tx
				.update(bids)
				.set({ status: 'lost', resolvedAt: closedAt })
				.where(and(eq(bids.bidWindowId, window.id), eq(bids.status, 'pending')));

			await createAuditLog(
				{
					entityType: 'assignment',
					entityId: window.assignmentId,
					action: 'unfilled',
					actorType: 'user',
					actorId,
					changes: {
						before: { status: window.assignmentStatus, userId: window.assignmentUserId },
						after: { status: 'unfilled', userId: null },
						bidWindowId: window.id
					}
				},
				tx
			);
		});

		broadcastBidWindowClosed({
			assignmentId: window.assignmentId,
			bidWindowId: window.id,
			winnerId: null
		});

		broadcastAssignmentUpdated({
			assignmentId: window.assignmentId,
			status: 'unfilled',
			routeId: window.routeId,
			bidWindowClosesAt: null
		});
	} else {
		resolvedResult = await resolveBidWindow(
			window.id,
			{
				actorType: 'user',
				actorId
			},
			locals.organizationId ?? locals.user.organizationId ?? ''
		);

		if (resolvedResult.reason === 'not_open') {
			throw error(409, 'Bid window already closed');
		}
	}

	const nextStatus =
		pendingBids.length === 0 ? 'closed' : resolvedResult?.resolved ? 'resolved' : window.status;

	await createAuditLog({
		entityType: 'bid_window',
		entityId: window.id,
		action: 'close',
		actorType: 'user',
		actorId,
		changes: {
			before: { status: window.status },
			after: { status: nextStatus },
			bidCount: resolvedResult?.bidCount ?? 0,
			winnerId: resolvedResult?.winnerId ?? null
		}
	});

	const bidWindow = await getBidWindowDetail(
		window.id,
		locals.organizationId ?? locals.user.organizationId ?? ''
	);

	return json({ bidWindow });
};
