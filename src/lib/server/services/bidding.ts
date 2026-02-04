/**
 * Bidding Service
 *
 * Manages bid windows for unfilled assignments.
 * See docs/adr/002-replacement-bidding-system.md for rationale.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	bids,
	bidWindows,
	driverMetrics,
	driverPreferences,
	notifications,
	routeCompletions,
	routes,
	user,
	warehouses
} from '$lib/server/db/schema';
import {
	sendBulkNotifications,
	sendManagerAlert,
	sendNotification
} from '$lib/server/services/notifications';
import { and, eq, lt, sql } from 'drizzle-orm';
import { toZonedTime } from 'date-fns-tz';
import { addMinutes, parseISO, startOfDay } from 'date-fns';
import logger from '$lib/server/logger';
import { getWeekStart, canDriverTakeAssignment } from './scheduling';

const TORONTO_TZ = 'America/Toronto';
const BID_WINDOW_DURATION_MINUTES = 30;

export interface CreateBidWindowResult {
	success: boolean;
	bidWindowId?: string;
	reason?: string;
	notifiedCount?: number;
}

export interface ResolveBidWindowResult {
	resolved: boolean;
	bidCount: number;
	winnerId?: string;
	reason?: string;
}

/**
 * Get the current time in Toronto timezone
 */
function getNowToronto(): Date {
	return toZonedTime(new Date(), TORONTO_TZ);
}

/**
 * Convert an assignment date string to a Date representing shift start (start of day in Toronto)
 */
function getShiftStartTime(dateString: string): Date {
	// Assignment date is stored as 'YYYY-MM-DD', shift starts at beginning of day
	const parsed = parseISO(dateString);
	return startOfDay(toZonedTime(parsed, TORONTO_TZ));
}

/**
 * Calculate the closesAt time for a bid window based on time until shift.
 *
 * Rules:
 * - If shift > 30 min away: closesAt = now + 30 minutes
 * - If shift ≤ 30 min away: closesAt = shift start time
 * - If shift already passed: no window (return null)
 */
function calculateWindowClosesAt(assignmentDate: string): Date | null {
	const now = getNowToronto();
	const shiftStart = getShiftStartTime(assignmentDate);

	// If shift already passed, no window
	if (shiftStart <= now) {
		return null;
	}

	const timeUntilShiftMs = shiftStart.getTime() - now.getTime();
	const thirtyMinutesMs = BID_WINDOW_DURATION_MINUTES * 60 * 1000;

	if (timeUntilShiftMs > thirtyMinutesMs) {
		// Shift > 30 min away: window = 30 minutes
		return addMinutes(now, BID_WINDOW_DURATION_MINUTES);
	} else {
		// Shift ≤ 30 min away: window closes at shift start
		return shiftStart;
	}
}

/**
 * Create a bid window when an assignment becomes unfilled.
 *
 * Triggers:
 * - Driver cancels assignment
 * - No-show detected
 * - Schedule generation creates unfilled assignment
 *
 * @param assignmentId - The assignment that needs a replacement driver
 */
export async function createBidWindow(assignmentId: string): Promise<CreateBidWindowResult> {
	const log = logger.child({ operation: 'createBidWindow', assignmentId });

	// Get assignment details
	const [assignment] = await db
		.select({
			id: assignments.id,
			routeId: assignments.routeId,
			date: assignments.date,
			status: assignments.status
		})
		.from(assignments)
		.where(eq(assignments.id, assignmentId));

	if (!assignment) {
		log.warn('Assignment not found');
		return { success: false, reason: 'Assignment not found' };
	}

	// Check for existing bid window (no duplicates)
	const [existingWindow] = await db
		.select({ id: bidWindows.id })
		.from(bidWindows)
		.where(eq(bidWindows.assignmentId, assignmentId));

	if (existingWindow) {
		log.info({ existingWindowId: existingWindow.id }, 'Bid window already exists');
		return { success: false, reason: 'Bid window already exists for this assignment' };
	}

	// Calculate window close time
	const closesAt = calculateWindowClosesAt(assignment.date);
	if (!closesAt) {
		log.info('Shift already passed, no window created');
		return { success: false, reason: 'Shift has already passed' };
	}

	// Get route name for notification
	const [route] = await db
		.select({ name: routes.name })
		.from(routes)
		.where(eq(routes.id, assignment.routeId));

	// Update assignment status to unfilled if not already
	if (assignment.status !== 'unfilled') {
		await db
			.update(assignments)
			.set({ status: 'unfilled', updatedAt: new Date() })
			.where(eq(assignments.id, assignmentId));
	}

	// Create the bid window
	const [bidWindow] = await db
		.insert(bidWindows)
		.values({
			assignmentId,
			opensAt: new Date(),
			closesAt,
			status: 'open'
		})
		.returning({ id: bidWindows.id });

	log.info({ bidWindowId: bidWindow.id, closesAt }, 'Bid window created');

	// Find eligible drivers and send notifications
	const notifiedCount = await notifyEligibleDrivers({
		assignmentId,
		assignmentDate: assignment.date,
		routeName: route?.name ?? 'Unknown Route',
		closesAt
	});

	return {
		success: true,
		bidWindowId: bidWindow.id,
		notifiedCount
	};
}

interface NotifyEligibleDriversParams {
	assignmentId: string;
	assignmentDate: string;
	routeName: string;
	closesAt: Date;
}

/**
 * Find and notify eligible drivers about an open bid window.
 *
 * Eligible drivers:
 * - Role = 'driver'
 * - Not flagged
 * - Under weekly cap for the assignment's week
 */
async function notifyEligibleDrivers(params: NotifyEligibleDriversParams): Promise<number> {
	const { assignmentId, assignmentDate, routeName, closesAt } = params;
	const log = logger.child({ operation: 'notifyEligibleDrivers', assignmentId });

	// Get all non-flagged drivers
	const drivers = await db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.role, 'driver'), eq(user.isFlagged, false)));

	if (drivers.length === 0) {
		log.info('No eligible drivers found');
		return 0;
	}

	// Get the week start for the assignment date
	const assignmentWeekStart = getWeekStart(parseISO(assignmentDate));

	// Filter to drivers under their weekly cap
	const eligibleDriverIds: string[] = [];
	for (const driver of drivers) {
		const canTake = await canDriverTakeAssignment(driver.id, assignmentWeekStart);
		if (canTake) {
			eligibleDriverIds.push(driver.id);
		}
	}

	if (eligibleDriverIds.length === 0) {
		log.info('No drivers under weekly cap');
		return 0;
	}

	// Format notification message
	const formattedDate = assignmentDate; // Already YYYY-MM-DD format
	const formattedCloseTime = closesAt.toLocaleTimeString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: TORONTO_TZ
	});

	// Create notifications for all eligible drivers
	const notificationRecords = eligibleDriverIds.map((userId) => ({
		userId,
		type: 'bid_open' as const,
		title: 'New Shift Available',
		body: `${routeName} on ${formattedDate} is open for bidding. Window closes at ${formattedCloseTime}.`,
		data: { assignmentId, routeName, closesAt: closesAt.toISOString() }
	}));

	await db.insert(notifications).values(notificationRecords);

	log.info({ count: eligibleDriverIds.length }, 'Notifications created');

	// TODO: Send push notifications via FCM when infrastructure is ready (DRV-69a)
	// For now, we create in-app notifications that drivers can see in the app

	return eligibleDriverIds.length;
}

async function calculateBidScore(userId: string, routeId: string): Promise<number> {
	const [metrics] = await db
		.select({
			completionRate: driverMetrics.completionRate,
			attendanceRate: driverMetrics.attendanceRate
		})
		.from(driverMetrics)
		.where(eq(driverMetrics.userId, userId));

	const [routeFamiliarity] = await db
		.select({ completionCount: routeCompletions.completionCount })
		.from(routeCompletions)
		.where(and(eq(routeCompletions.userId, userId), eq(routeCompletions.routeId, routeId)));

	const [preferences] = await db
		.select({ preferredRoutes: driverPreferences.preferredRoutes })
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

	const completionRate = metrics?.completionRate ?? 0;
	const attendanceRate = metrics?.attendanceRate ?? 0;
	const familiarityNormalized = Math.min((routeFamiliarity?.completionCount ?? 0) / 20, 1);
	const preferredRoutes = preferences?.preferredRoutes ?? [];
	const preferenceBonus = preferredRoutes.slice(0, 3).includes(routeId) ? 1 : 0;

	return (
		completionRate * 0.4 +
		familiarityNormalized * 0.3 +
		attendanceRate * 0.2 +
		preferenceBonus * 0.1
	);
}

/**
 * Resolve a bid window by scoring bids and selecting a winner.
 */
export async function resolveBidWindow(bidWindowId: string): Promise<ResolveBidWindowResult> {
	const log = logger.child({ operation: 'resolveBidWindow', bidWindowId });

	const [window] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			status: bidWindows.status
		})
		.from(bidWindows)
		.where(eq(bidWindows.id, bidWindowId));

	if (!window) {
		log.warn('Bid window not found');
		return { resolved: false, bidCount: 0, reason: 'not_found' };
	}

	if (window.status !== 'open') {
		log.info({ status: window.status }, 'Bid window not open');
		return { resolved: false, bidCount: 0, reason: 'not_open' };
	}

	const [assignment] = await db
		.select({
			id: assignments.id,
			date: assignments.date,
			routeId: assignments.routeId,
			routeName: routes.name
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.where(eq(assignments.id, window.assignmentId));

	if (!assignment) {
		log.warn({ assignmentId: window.assignmentId }, 'Assignment not found');
		return { resolved: false, bidCount: 0, reason: 'assignment_not_found' };
	}

	const pendingBids = await db
		.select({
			id: bids.id,
			userId: bids.userId,
			bidAt: bids.bidAt
		})
		.from(bids)
		.where(and(eq(bids.assignmentId, assignment.id), eq(bids.status, 'pending')));

	if (pendingBids.length === 0) {
		log.info({ assignmentId: assignment.id }, 'No bids to resolve');

		// Alert manager that assignment remains unfilled
		try {
			await sendManagerAlert(assignment.routeId, 'route_unfilled', {
				routeName: assignment.routeName,
				date: assignment.date
			});
			log.info({ routeId: assignment.routeId }, 'Manager alerted about unfilled route');
		} catch {
			// Best-effort alert, don't fail resolution
		}

		return { resolved: false, bidCount: 0, reason: 'no_bids' };
	}

	const scoredBids = await Promise.all(
		pendingBids.map(async (bid) => ({
			...bid,
			score: await calculateBidScore(bid.userId, assignment.routeId)
		}))
	);

	scoredBids.sort((a, b) => {
		if (b.score !== a.score) {
			return b.score - a.score;
		}
		return a.bidAt.getTime() - b.bidAt.getTime();
	});

	const winner = scoredBids[0];
	const resolvedAt = new Date();

	await db.transaction(async (tx) => {
		await tx
			.update(bidWindows)
			.set({ status: 'resolved', winnerId: winner.userId })
			.where(eq(bidWindows.id, bidWindowId));

		await tx
			.update(assignments)
			.set({
				userId: winner.userId,
				status: 'scheduled',
				assignedBy: 'bid',
				assignedAt: resolvedAt,
				updatedAt: resolvedAt
			})
			.where(eq(assignments.id, assignment.id));

		for (const bid of scoredBids) {
			await tx
				.update(bids)
				.set({
					score: bid.score,
					status: bid.id === winner.id ? 'won' : 'lost',
					resolvedAt
				})
				.where(eq(bids.id, bid.id));
		}
	});

	const formattedDate = assignment.date;
	const winnerBody = `You won ${assignment.routeName} for ${formattedDate}`;
	const loserBody = `${assignment.routeName} assigned to another driver`;
	const notificationData = {
		assignmentId: assignment.id,
		bidWindowId,
		routeName: assignment.routeName,
		assignmentDate: formattedDate
	};

	await sendNotification(winner.userId, 'bid_won', {
		customBody: winnerBody,
		data: notificationData
	});

	if (scoredBids.length > 1) {
		const loserIds = scoredBids.slice(1).map((bid) => bid.userId);
		await sendBulkNotifications(loserIds, 'bid_lost', {
			customBody: loserBody,
			data: notificationData
		});
	}

	log.info({ winnerId: winner.userId, bidCount: scoredBids.length }, 'Bid window resolved');

	return { resolved: true, bidCount: scoredBids.length, winnerId: winner.userId };
}

/**
 * Get all open bid windows that have passed their closesAt time.
 * Used by the cron job to resolve expired windows.
 */
export async function getExpiredBidWindows(): Promise<Array<{ id: string; assignmentId: string }>> {
	const now = new Date();

	return db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId
		})
		.from(bidWindows)
		.where(and(eq(bidWindows.status, 'open'), lt(bidWindows.closesAt, now)));
}

export async function getBidWindowDetail(windowId: string) {
	const bidCountSubquery = db
		.select({
			assignmentId: bids.assignmentId,
			count: sql<number>`count(*)`.as('count')
		})
		.from(bids)
		.groupBy(bids.assignmentId)
		.as('bid_counts');

	const [row] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			assignmentDate: assignments.date,
			routeName: routes.name,
			warehouseName: warehouses.name,
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
		.where(eq(bidWindows.id, windowId));

	if (!row) return null;

	return {
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
	};
}
