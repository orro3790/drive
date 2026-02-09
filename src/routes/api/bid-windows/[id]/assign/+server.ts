/**
 * Bid Window Manual Assignment API
 *
 * POST /api/bid-windows/[id]/assign - Manually assign a driver and close bidding
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { assignments, bidWindows, bids, routes, user, warehouses } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { sendBulkNotifications, sendNotification } from '$lib/server/services/notifications';
import { getBidWindowDetail } from '$lib/server/services/bidding';
import { bidWindowIdParamsSchema } from '$lib/schemas/api/bidding';
import { createAuditLog } from '$lib/server/services/audit';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed
} from '$lib/server/realtime/managerSse';

const assignSchema = z
	.object({
		driverId: z
			.string()
			.trim()
			.min(1)
			.max(128)
			.regex(/^[A-Za-z0-9:_-]+$/)
	})
	.strict();

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const actorId = locals.user.id;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = assignSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

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

	const canAccess = await canManagerAccessWarehouse(actorId, window.warehouseId);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

	if (window.status === 'resolved') {
		throw error(409, 'Bid window already resolved');
	}

	if (!['unfilled', 'cancelled'].includes(window.assignmentStatus)) {
		throw error(409, 'Assignment already filled');
	}

	const [driver] = await db
		.select({ id: user.id, name: user.name, role: user.role })
		.from(user)
		.where(eq(user.id, result.data.driverId));

	if (!driver || driver.role !== 'driver') {
		throw error(400, 'Driver not found');
	}

	const pendingBids = await db
		.select({ id: bids.id, userId: bids.userId })
		.from(bids)
		.where(and(eq(bids.assignmentId, window.assignmentId), eq(bids.status, 'pending')));

	const resolvedAt = new Date();

	await db.transaction(async (tx) => {
		await tx
			.update(bidWindows)
			.set({ status: 'resolved', winnerId: driver.id })
			.where(eq(bidWindows.id, window.id));

		await tx
			.update(assignments)
			.set({
				userId: driver.id,
				status: 'scheduled',
				assignedBy: 'manager',
				assignedAt: resolvedAt,
				updatedAt: resolvedAt
			})
			.where(eq(assignments.id, window.assignmentId));

		if (pendingBids.length > 0) {
			await tx
				.update(bids)
				.set({ status: 'lost', resolvedAt })
				.where(and(eq(bids.assignmentId, window.assignmentId), eq(bids.status, 'pending')));

			const winnerBid = pendingBids.find((bid) => bid.userId === driver.id);
			if (winnerBid) {
				await tx.update(bids).set({ status: 'won', resolvedAt }).where(eq(bids.id, winnerBid.id));
			}
		}

		await createAuditLog(
			{
				entityType: 'assignment',
				entityId: window.assignmentId,
				action: 'manual_assign',
				actorType: 'user',
				actorId,
				changes: {
					before: {
						status: window.assignmentStatus,
						userId: window.assignmentUserId
					},
					after: {
						status: 'scheduled',
						userId: driver.id,
						assignedBy: 'manager',
						assignedAt: resolvedAt
					},
					bidWindowId: window.id
				}
			},
			tx
		);
	});

	const notificationData = {
		assignmentId: window.assignmentId,
		bidWindowId: window.id,
		routeName: window.routeName,
		assignmentDate: window.assignmentDate
	};

	await sendNotification(driver.id, 'assignment_confirmed', {
		customBody: `You were assigned ${window.routeName} for ${window.assignmentDate}.`,
		data: notificationData
	});

	const loserIds = pendingBids.filter((bid) => bid.userId !== driver.id).map((bid) => bid.userId);

	if (loserIds.length > 0) {
		await sendBulkNotifications(loserIds, 'bid_lost', {
			customBody: `${window.routeName} for ${window.assignmentDate} was assigned by a manager.`,
			data: notificationData
		});
	}

	broadcastBidWindowClosed({
		assignmentId: window.assignmentId,
		bidWindowId: window.id,
		winnerId: driver.id,
		winnerName: driver.name
	});

	broadcastAssignmentUpdated({
		assignmentId: window.assignmentId,
		status: 'scheduled',
		driverId: driver.id,
		driverName: driver.name,
		routeId: window.routeId
	});

	const bidWindow = await getBidWindowDetail(window.id);

	return json({ bidWindow });
};
