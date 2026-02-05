/**
 * Bid Windows API - List
 *
 * GET /api/bid-windows - List bid windows with warehouse scoping
 *
 * Query params:
 * - status: 'open' | 'resolved' | 'all' (default: 'all')
 * - since: ISO date for resolved windows (default: 24h ago)
 * - warehouseId: optional warehouse filter
 *
 * Returns bid windows joined with assignment/route/warehouse data.
 * Only accessible by managers, scoped to their warehouses.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bidWindows, assignments, routes, warehouses, bids, user } from '$lib/server/db/schema';
import { and, eq, gte, inArray, sql, or } from 'drizzle-orm';
import { getManagerWarehouseIds } from '$lib/server/services/managers';
import { getExpiredBidWindows, resolveBidWindow } from '$lib/server/services/bidding';
import logger from '$lib/server/logger';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const log = logger.child({ operation: 'listBidWindows', userId: locals.user.id });

	// Parse query params
	const statusParam = url.searchParams.get('status') ?? 'all';
	const sinceParam = url.searchParams.get('since');
	const warehouseIdParam = url.searchParams.get('warehouseId');

	// Validate status param
	if (!['open', 'resolved', 'all'].includes(statusParam)) {
		throw error(400, 'Invalid status parameter');
	}

	// Get manager's warehouse IDs for scoping
	const managerWarehouseIds = await getManagerWarehouseIds(locals.user.id);
	if (managerWarehouseIds.length === 0) {
		return json({ bidWindows: [], lastUpdated: new Date().toISOString() });
	}

	// If warehouseId param provided, verify access
	if (warehouseIdParam && !managerWarehouseIds.includes(warehouseIdParam)) {
		throw error(403, 'No access to this warehouse');
	}

	const warehouseIds = warehouseIdParam ? [warehouseIdParam] : managerWarehouseIds;

	// Resolve any expired bid windows before returning (event-driven)
	try {
		const expiredWindows = await getExpiredBidWindows();
		for (const window of expiredWindows) {
			await resolveBidWindow(window.id);
		}
		if (expiredWindows.length > 0) {
			log.info({ count: expiredWindows.length }, 'Resolved expired bid windows');
		}
	} catch (err) {
		log.warn(
			{ error: err instanceof Error ? err.message : 'Unknown' },
			'Failed to resolve expired windows'
		);
		// Continue with query - don't fail the request
	}

	// Default since to 24h ago for resolved windows
	const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 24 * 60 * 60 * 1000);

	// Build status conditions
	const statusConditions =
		statusParam === 'all'
			? or(
					eq(bidWindows.status, 'open'),
					and(eq(bidWindows.status, 'resolved'), gte(bidWindows.closesAt, since))
				)
			: statusParam === 'open'
				? eq(bidWindows.status, 'open')
				: and(eq(bidWindows.status, 'resolved'), gte(bidWindows.closesAt, since));

	// Get bid count subquery
	const bidCountSubquery = db
		.select({
			assignmentId: bids.assignmentId,
			count: sql<number>`count(*)`.as('count')
		})
		.from(bids)
		.groupBy(bids.assignmentId)
		.as('bid_counts');

	// Query bid windows with joins
	const results = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			assignmentDate: assignments.date,
			routeName: routes.name,
			warehouseName: warehouses.name,
			warehouseId: warehouses.id,
			opensAt: bidWindows.opensAt,
			closesAt: bidWindows.closesAt,
			status: bidWindows.status,
			winnerId: bidWindows.winnerId,
			winnerName: user.name,
			bidCount: sql<number>`coalesce(${bidCountSubquery.count}, 0)`
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.leftJoin(user, eq(bidWindows.winnerId, user.id))
		.leftJoin(bidCountSubquery, eq(bidCountSubquery.assignmentId, bidWindows.assignmentId))
		.where(and(inArray(warehouses.id, warehouseIds), statusConditions))
		.orderBy(bidWindows.closesAt);

	// Map status from db enum to simple open/resolved
	const mappedResults = results.map((row) => ({
		id: row.id,
		assignmentId: row.assignmentId,
		assignmentDate: row.assignmentDate,
		routeName: row.routeName,
		warehouseName: row.warehouseName,
		opensAt: row.opensAt.toISOString(),
		closesAt: row.closesAt.toISOString(),
		status: row.status === 'open' ? 'open' : 'resolved',
		winnerId: row.winnerId,
		winnerName: row.winnerName,
		bidCount: Number(row.bidCount)
	}));

	return json({
		bidWindows: mappedResults,
		lastUpdated: new Date().toISOString()
	});
};
