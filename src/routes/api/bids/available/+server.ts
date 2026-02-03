/**
 * Available Bids API
 *
 * GET /api/bids/available - Get open bid windows the current driver is eligible for
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, bidWindows, bids, routes, warehouses, user } from '$lib/server/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { parseISO } from 'date-fns';
import { getWeekStart, canDriverTakeAssignment } from '$lib/server/services/scheduling';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can view available bids');
	}

	// Check if driver is flagged
	const [driverInfo] = await db
		.select({ isFlagged: user.isFlagged })
		.from(user)
		.where(eq(user.id, locals.user.id));

	if (driverInfo?.isFlagged) {
		// Flagged drivers can't bid, return empty list
		return json({ bidWindows: [] });
	}

	const now = new Date();

	// Get all open bid windows with assignment details
	const openWindows = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			opensAt: bidWindows.opensAt,
			closesAt: bidWindows.closesAt,
			assignmentDate: assignments.date,
			routeId: assignments.routeId,
			routeName: routes.name,
			warehouseId: assignments.warehouseId,
			warehouseName: warehouses.name
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(and(eq(bidWindows.status, 'open'), gt(bidWindows.closesAt, now)));

	if (openWindows.length === 0) {
		return json({ bidWindows: [] });
	}

	// Get bids the driver has already made
	const existingBids = await db
		.select({ assignmentId: bids.assignmentId })
		.from(bids)
		.where(eq(bids.userId, locals.user.id));

	const alreadyBidAssignments = new Set(existingBids.map((b) => b.assignmentId));

	// Filter windows by eligibility
	const eligibleWindows = [];

	for (const window of openWindows) {
		// Skip if driver already bid on this assignment
		if (alreadyBidAssignments.has(window.assignmentId)) {
			continue;
		}

		// Check weekly cap for the assignment's week
		const assignmentWeekStart = getWeekStart(parseISO(window.assignmentDate));
		const canTake = await canDriverTakeAssignment(locals.user.id, assignmentWeekStart);
		if (!canTake) {
			continue;
		}

		eligibleWindows.push({
			id: window.id,
			assignmentId: window.assignmentId,
			assignmentDate: window.assignmentDate,
			routeName: window.routeName,
			warehouseName: window.warehouseName,
			opensAt: window.opensAt.toISOString(),
			closesAt: window.closesAt.toISOString()
		});
	}

	return json({ bidWindows: eligibleWindows });
};
