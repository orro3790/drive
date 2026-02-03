/**
 * My Bids API
 *
 * GET /api/bids/mine - Get current driver's bids (pending and past)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bids, assignments, routes, warehouses } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can view their bids');
	}

	// Get all bids for this driver with assignment details
	const driverBids = await db
		.select({
			id: bids.id,
			assignmentId: bids.assignmentId,
			status: bids.status,
			score: bids.score,
			bidAt: bids.bidAt,
			windowClosesAt: bids.windowClosesAt,
			resolvedAt: bids.resolvedAt,
			assignmentDate: assignments.date,
			routeName: routes.name,
			warehouseName: warehouses.name
		})
		.from(bids)
		.innerJoin(assignments, eq(bids.assignmentId, assignments.id))
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(eq(bids.userId, locals.user.id))
		.orderBy(desc(bids.bidAt));

	const formattedBids = driverBids.map((bid) => ({
		id: bid.id,
		assignmentId: bid.assignmentId,
		assignmentDate: bid.assignmentDate,
		routeName: bid.routeName,
		warehouseName: bid.warehouseName,
		status: bid.status,
		score: bid.score,
		bidAt: bid.bidAt.toISOString(),
		windowClosesAt: bid.windowClosesAt.toISOString(),
		resolvedAt: bid.resolvedAt?.toISOString() ?? null
	}));

	return json({ bids: formattedBids });
};
