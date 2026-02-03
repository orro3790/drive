/**
 * Bidding Service
 *
 * Manages bid windows for unfilled assignments.
 * See docs/adr/002-replacement-bidding-system.md for rationale.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	bidWindows,
	notifications,
	routes,
	user
} from '$lib/server/db/schema';
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

/**
 * Get all open bid windows that have passed their closesAt time.
 * Used by the cron job to resolve expired windows.
 */
export async function getExpiredBidWindows(): Promise<
	Array<{ id: string; assignmentId: string }>
> {
	const now = new Date();

	return db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId
		})
		.from(bidWindows)
		.where(and(eq(bidWindows.status, 'open'), lt(bidWindows.closesAt, now)));
}
