/**
 * Bids API
 *
 * POST /api/bids - Submit a bid on an assignment
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bids, bidWindows, assignments, user } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { parseISO } from 'date-fns';
import { getWeekStart, canDriverTakeAssignment } from '$lib/server/services/scheduling';
import logger from '$lib/server/logger';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can submit bids');
	}

	const log = logger.child({ operation: 'submitBid', userId: locals.user.id });

	const body = await request.json();
	const { assignmentId } = body;

	if (!assignmentId || typeof assignmentId !== 'string') {
		throw error(400, 'assignmentId is required');
	}

	// Check if driver is flagged
	const [driverInfo] = await db
		.select({ isFlagged: user.isFlagged })
		.from(user)
		.where(eq(user.id, locals.user.id));

	if (driverInfo?.isFlagged) {
		log.warn('Flagged driver attempted to bid');
		throw error(403, 'Flagged drivers cannot submit bids');
	}

	// Get the bid window for this assignment
	const [window] = await db
		.select({
			id: bidWindows.id,
			status: bidWindows.status,
			closesAt: bidWindows.closesAt,
			assignmentDate: assignments.date
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.where(eq(bidWindows.assignmentId, assignmentId));

	if (!window) {
		throw error(404, 'No bid window found for this assignment');
	}

	if (window.status !== 'open') {
		throw error(400, 'Bid window is not open');
	}

	const now = new Date();
	if (window.closesAt <= now) {
		throw error(400, 'Bid window has closed');
	}

	// Check if driver already bid on this assignment
	const [existingBid] = await db
		.select({ id: bids.id })
		.from(bids)
		.where(and(eq(bids.assignmentId, assignmentId), eq(bids.userId, locals.user.id)));

	if (existingBid) {
		throw error(400, 'You have already bid on this assignment');
	}

	// Check weekly cap for the assignment's week
	const assignmentWeekStart = getWeekStart(parseISO(window.assignmentDate));
	const canTake = await canDriverTakeAssignment(locals.user.id, assignmentWeekStart);
	if (!canTake) {
		throw error(400, 'You have reached your weekly cap for that week');
	}

	// Create the bid
	const [newBid] = await db
		.insert(bids)
		.values({
			assignmentId,
			userId: locals.user.id,
			status: 'pending',
			windowClosesAt: window.closesAt
		})
		.returning({
			id: bids.id,
			assignmentId: bids.assignmentId,
			status: bids.status,
			bidAt: bids.bidAt,
			windowClosesAt: bids.windowClosesAt
		});

	log.info({ bidId: newBid.id, assignmentId }, 'Bid submitted');

	return json({
		success: true,
		bid: {
			id: newBid.id,
			assignmentId: newBid.assignmentId,
			status: newBid.status,
			bidAt: newBid.bidAt.toISOString(),
			windowClosesAt: newBid.windowClosesAt.toISOString()
		}
	});
};
