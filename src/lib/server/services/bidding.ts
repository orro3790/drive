/**
 * Bidding Service
 *
 * Manages bid windows for unfilled assignments.
 * See documentation/adr/002-replacement-bidding-system.md for rationale.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	bids,
	bidWindows,
	driverHealthState,
	driverMetrics,
	driverPreferences,
	notifications,
	routeCompletions,
	routes,
	shifts,
	user,
	warehouses
} from '$lib/server/db/schema';
import {
	sendBulkNotifications,
	sendManagerAlert,
	sendNotification
} from '$lib/server/services/notifications';
import { createAuditLog, type AuditActor } from '$lib/server/services/audit';
import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { toZonedTime } from 'date-fns-tz';
import { addHours, differenceInMonths, parseISO, set, startOfDay } from 'date-fns';
import logger, { toSafeErrorMessage } from '$lib/server/logger';
import { getWeekStart, canDriverTakeAssignment } from './scheduling';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed,
	broadcastBidWindowOpened
} from '$lib/server/realtime/managerSse';
import { calculateBidScoreParts, dispatchPolicy } from '$lib/config/dispatchPolicy';

const INSTANT_MODE_CUTOFF_MS = dispatchPolicy.bidding.instantModeCutoffHours * 60 * 60 * 1000;

export type BidWindowMode = 'competitive' | 'instant' | 'emergency';
export type BidWindowTrigger = 'cancellation' | 'auto_drop' | 'no_show' | 'manager';

export interface CreateBidWindowResult {
	success: boolean;
	bidWindowId?: string;
	reason?: string;
	notifiedCount?: number;
}

export interface CreateBidWindowOptions {
	mode?: BidWindowMode;
	trigger?: BidWindowTrigger;
	payBonusPercent?: number;
	allowPastShift?: boolean;
}

export interface ResolveBidWindowResult {
	resolved: boolean;
	bidCount: number;
	winnerId?: string;
	reason?: string;
	transitioned?: boolean;
}

export interface InstantAssignResult {
	instantlyAssigned: boolean;
	bidId?: string;
	assignmentId?: string;
	error?: string;
}

/**
 * Get the current time in Toronto timezone
 */
function getNowToronto(): Date {
	return toZonedTime(new Date(), dispatchPolicy.timezone.toronto);
}

/**
 * Convert an assignment date string to shift start (07:00 Toronto)
 */
function getShiftStartTime(dateString: string): Date {
	const parsed = parseISO(dateString);
	const toronto = toZonedTime(parsed, dispatchPolicy.timezone.toronto);
	return set(startOfDay(toronto), {
		hours: dispatchPolicy.shifts.startHourLocal,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});
}

/**
 * Determine the appropriate bid window mode based on time until shift.
 *
 * - > 24h to shift: competitive (closesAt = 24h before shift)
 * - <= 24h to shift: instant (closesAt = shift start)
 * - Emergency: always closesAt = shift start (or end of day if past)
 */
function determineModeAndClosesAt(
	assignmentDate: string,
	options: CreateBidWindowOptions = {}
): { mode: BidWindowMode; closesAt: Date } | null {
	const now = getNowToronto();
	const shiftStart = getShiftStartTime(assignmentDate);

	// If explicitly set, use it
	if (options.mode === 'emergency') {
		const closesAt = shiftStart > now ? shiftStart : set(now, { hours: 23, minutes: 59 });
		return { mode: 'emergency', closesAt };
	}

	// If shift already passed
	if (shiftStart <= now) {
		if (options.allowPastShift) {
			return { mode: 'instant', closesAt: set(now, { hours: 23, minutes: 59 }) };
		}
		return null;
	}

	const timeUntilShiftMs = shiftStart.getTime() - now.getTime();

	if (options.mode === 'instant' || timeUntilShiftMs <= INSTANT_MODE_CUTOFF_MS) {
		return { mode: 'instant', closesAt: shiftStart };
	}

	// Competitive: closes 24h before shift
	const closesAt = addHours(shiftStart, -dispatchPolicy.bidding.instantModeCutoffHours);
	return { mode: 'competitive', closesAt };
}

/**
 * Create a bid window when an assignment becomes unfilled.
 *
 * Mode selection:
 * - Explicit mode in options takes priority
 * - > 24h to shift: competitive (closesAt = 24h before shift)
 * - <= 24h to shift: instant (closesAt = shift start)
 * - Emergency: always instant-like with bonus
 */
export async function createBidWindow(
	assignmentId: string,
	options: CreateBidWindowOptions = {}
): Promise<CreateBidWindowResult> {
	const log = logger.child({ operation: 'createBidWindow', ...options });

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

	// Check for existing OPEN bid window only (resolved/closed windows are fine)
	const [existingWindow] = await db
		.select({ id: bidWindows.id })
		.from(bidWindows)
		.where(and(eq(bidWindows.assignmentId, assignmentId), eq(bidWindows.status, 'open')));

	if (existingWindow) {
		log.info('Open bid window already exists');
		return { success: false, reason: 'Open bid window already exists for this assignment' };
	}

	const result = determineModeAndClosesAt(assignment.date, options);
	if (!result) {
		log.info('Shift already passed, no window created');
		return { success: false, reason: 'Shift has already passed' };
	}

	const { mode, closesAt } = result;

	const [route] = await db
		.select({ name: routes.name })
		.from(routes)
		.where(eq(routes.id, assignment.routeId));
	const routeName = route?.name ?? 'Unknown Route';

	if (assignment.status !== 'unfilled') {
		const updatedAt = new Date();
		await db
			.update(assignments)
			.set({ status: 'unfilled', updatedAt })
			.where(eq(assignments.id, assignmentId));

		await createAuditLog({
			entityType: 'assignment',
			entityId: assignmentId,
			action: 'unfilled',
			actorType: 'system',
			actorId: null,
			changes: {
				before: { status: assignment.status },
				after: { status: 'unfilled' },
				reason: 'bid_window_opened',
				trigger: options.trigger
			}
		});
	}

	const [bidWindow] = await db
		.insert(bidWindows)
		.values({
			assignmentId,
			mode,
			trigger: options.trigger ?? null,
			payBonusPercent: options.payBonusPercent ?? 0,
			opensAt: new Date(),
			closesAt,
			status: 'open'
		})
		.returning({ id: bidWindows.id });

	log.info({ mode, closesAt }, 'Bid window created');

	const notifiedCount = await notifyEligibleDrivers({
		assignmentId,
		assignmentDate: assignment.date,
		routeName,
		closesAt,
		mode,
		payBonusPercent: options.payBonusPercent ?? 0
	});

	broadcastBidWindowOpened({
		assignmentId,
		routeId: assignment.routeId,
		routeName,
		assignmentDate: assignment.date,
		closesAt: closesAt.toISOString()
	});

	broadcastAssignmentUpdated({
		assignmentId,
		status: 'unfilled',
		driverId: null,
		driverName: null,
		routeId: assignment.routeId,
		bidWindowClosesAt: closesAt.toISOString()
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
	mode: BidWindowMode;
	payBonusPercent: number;
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
	const { assignmentId, assignmentDate, routeName, closesAt, mode, payBonusPercent } = params;
	const log = logger.child({ operation: 'notifyEligibleDrivers', mode });

	const drivers = await db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.role, 'driver'), eq(user.isFlagged, false)));

	if (drivers.length === 0) {
		log.info('No eligible drivers found');
		return 0;
	}

	const assignmentWeekStart = getWeekStart(parseISO(assignmentDate));

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

	const formattedDate = assignmentDate;
	const isEmergency = mode === 'emergency';
	const isInstant = mode === 'instant' || isEmergency;

	const notificationType = isEmergency
		? ('emergency_route_available' as const)
		: ('bid_open' as const);

	let body: string;
	if (isEmergency) {
		const bonusText = payBonusPercent > 0 ? ` +${payBonusPercent}% bonus.` : '';
		body = `${routeName} on ${formattedDate} needs a driver urgently.${bonusText} First to accept gets it.`;
	} else if (isInstant) {
		body = `${routeName} on ${formattedDate} is available. First to accept gets it.`;
	} else {
		const formattedCloseTime = closesAt.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: dispatchPolicy.timezone.toronto
		});
		body = `${routeName} on ${formattedDate} is open for bidding. Window closes at ${formattedCloseTime}.`;
	}

	const title = isEmergency ? 'Priority Route Available' : 'New Shift Available';

	const notificationRecords = eligibleDriverIds.map((driverId) => ({
		userId: driverId,
		type: notificationType,
		title,
		body,
		data: { assignmentId, routeName, closesAt: closesAt.toISOString(), mode }
	}));

	await db.insert(notifications).values(notificationRecords);

	log.info({ count: eligibleDriverIds.length, mode }, 'Notifications created');

	return eligibleDriverIds.length;
}

async function calculateBidScore(userId: string, routeId: string): Promise<number> {
	const [healthState] = await db
		.select({ currentScore: driverHealthState.currentScore })
		.from(driverHealthState)
		.where(eq(driverHealthState.userId, userId));

	const [driver] = await db
		.select({ createdAt: user.createdAt })
		.from(user)
		.where(eq(user.id, userId));

	const [routeFamiliarity] = await db
		.select({ completionCount: routeCompletions.completionCount })
		.from(routeCompletions)
		.where(and(eq(routeCompletions.userId, userId), eq(routeCompletions.routeId, routeId)));

	const [preferences] = await db
		.select({ preferredRoutes: driverPreferences.preferredRoutes })
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

	const healthScore = healthState?.currentScore ?? 0;
	const tenureMonths = driver?.createdAt ? differenceInMonths(new Date(), driver.createdAt) : 0;
	const preferredRoutes = preferences?.preferredRoutes ?? [];

	return calculateBidScoreParts({
		healthScore,
		routeFamiliarityCount: routeFamiliarity?.completionCount ?? 0,
		tenureMonths,
		preferredRouteIds: preferredRoutes,
		routeId
	}).total;
}

/**
 * Resolve a bid window by scoring bids and selecting a winner.
 */
export async function resolveBidWindow(
	bidWindowId: string,
	actor: AuditActor = { actorType: 'system', actorId: null }
): Promise<ResolveBidWindowResult> {
	const log = logger.child({ operation: 'resolveBidWindow' });

	const [window] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			status: bidWindows.status,
			mode: bidWindows.mode
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
			routeName: routes.name,
			status: assignments.status,
			userId: assignments.userId
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.where(eq(assignments.id, window.assignmentId));

	if (!assignment) {
		log.warn('Assignment not found');
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
		log.info('No bids to resolve');

		// For competitive windows with no bids, transition to instant mode
		if (window.mode === 'competitive') {
			await transitionToInstantMode(bidWindowId);
			return {
				resolved: false,
				bidCount: 0,
				reason: 'transitioned_to_instant',
				transitioned: true
			};
		}

		// For instant/emergency windows with no bids, close the window
		await db.update(bidWindows).set({ status: 'closed' }).where(eq(bidWindows.id, bidWindowId));

		try {
			await sendManagerAlert(assignment.routeId, 'route_unfilled', {
				routeName: assignment.routeName,
				date: assignment.date
			});
			log.info('Manager alerted about unfilled route');
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

	// Same-day conflict guard: check which bidders already have an assignment for this date
	const bidderIds = scoredBids.map((b) => b.userId);
	const conflicts = await db
		.select({ userId: assignments.userId })
		.from(assignments)
		.where(
			and(
				inArray(assignments.userId, bidderIds),
				eq(assignments.date, assignment.date),
				ne(assignments.id, assignment.id),
				ne(assignments.status, 'cancelled')
			)
		);
	const conflictSet = new Set(conflicts.map((c) => c.userId));

	const winner = scoredBids.find((b) => !conflictSet.has(b.userId));

	if (!winner) {
		log.info('All bidders have same-day conflicts');

		if (window.mode === 'competitive') {
			await transitionToInstantMode(bidWindowId);
			return {
				resolved: false,
				bidCount: scoredBids.length,
				reason: 'transitioned_to_instant',
				transitioned: true
			};
		}

		// Close the window so it's not re-picked up
		await db.update(bidWindows).set({ status: 'closed' }).where(eq(bidWindows.id, bidWindowId));

		try {
			await sendManagerAlert(assignment.routeId, 'route_unfilled', {
				routeName: assignment.routeName,
				date: assignment.date
			});
		} catch {
			// Best-effort alert
		}

		return { resolved: false, bidCount: scoredBids.length, reason: 'all_bidders_conflicted' };
	}

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

		await createAuditLog(
			{
				entityType: 'assignment',
				entityId: assignment.id,
				action: 'assign',
				actorType: actor.actorType,
				actorId: actor.actorId ?? null,
				changes: {
					before: {
						status: assignment.status,
						userId: assignment.userId
					},
					after: {
						status: 'scheduled',
						userId: winner.userId,
						assignedBy: 'bid',
						assignedAt: resolvedAt
					},
					bidWindowId
				}
			},
			tx
		);
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

	broadcastBidWindowClosed({
		assignmentId: assignment.id,
		bidWindowId,
		winnerId: winner.userId
	});

	broadcastAssignmentUpdated({
		assignmentId: assignment.id,
		status: 'scheduled',
		driverId: winner.userId,
		routeId: assignment.routeId
	});

	log.info({ bidCount: scoredBids.length }, 'Bid window resolved');

	return { resolved: true, bidCount: scoredBids.length, winnerId: winner.userId };
}

/**
 * Get all open bid windows that have passed their closesAt time.
 * Used by the cron job to resolve expired windows.
 */
export async function getExpiredBidWindows(
	warehouseIds?: string[]
): Promise<Array<{ id: string; assignmentId: string; mode: BidWindowMode }>> {
	const now = new Date();

	if (warehouseIds && warehouseIds.length > 0) {
		return db
			.select({
				id: bidWindows.id,
				assignmentId: bidWindows.assignmentId,
				mode: bidWindows.mode
			})
			.from(bidWindows)
			.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
			.where(
				and(
					eq(bidWindows.status, 'open'),
					lt(bidWindows.closesAt, now),
					inArray(assignments.warehouseId, warehouseIds)
				)
			);
	}

	return db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			mode: bidWindows.mode
		})
		.from(bidWindows)
		.where(and(eq(bidWindows.status, 'open'), lt(bidWindows.closesAt, now)));
}

/**
 * Transition a competitive bid window to instant mode.
 * Called when a competitive window expires with no bids.
 */
export async function transitionToInstantMode(bidWindowId: string): Promise<void> {
	const log = logger.child({ operation: 'transitionToInstantMode' });

	const [window] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			mode: bidWindows.mode
		})
		.from(bidWindows)
		.where(eq(bidWindows.id, bidWindowId));

	if (!window) {
		log.warn('Bid window not found');
		return;
	}

	const [assignment] = await db
		.select({
			date: assignments.date,
			routeId: assignments.routeId
		})
		.from(assignments)
		.where(eq(assignments.id, window.assignmentId));

	if (!assignment) {
		log.warn('Assignment not found for transition');
		return;
	}

	const shiftStart = getShiftStartTime(assignment.date);

	// If the shift has already started, close the window — transitioning would
	// just create another immediately-expired window causing an infinite loop.
	if (shiftStart <= new Date()) {
		await db.update(bidWindows).set({ status: 'closed' }).where(eq(bidWindows.id, bidWindowId));
		log.info('Shift already started, closed window');
		return;
	}

	await db
		.update(bidWindows)
		.set({ mode: 'instant', closesAt: shiftStart })
		.where(eq(bidWindows.id, bidWindowId));

	const [route] = await db
		.select({ name: routes.name })
		.from(routes)
		.where(eq(routes.id, assignment.routeId));
	const routeName = route?.name ?? 'Unknown Route';

	await notifyEligibleDrivers({
		assignmentId: window.assignmentId,
		assignmentDate: assignment.date,
		routeName,
		closesAt: shiftStart,
		mode: 'instant',
		payBonusPercent: 0
	});

	log.info('Transitioned to instant mode');
}

/**
 * Instantly assign a driver to an assignment via an instant/emergency bid window.
 * Uses SELECT FOR UPDATE to prevent race conditions.
 */
export async function instantAssign(
	assignmentId: string,
	userId: string,
	bidWindowId: string
): Promise<InstantAssignResult> {
	const log = logger.child({ operation: 'instantAssign' });

	try {
		return await db.transaction(async (tx) => {
			// Lock the bid window row with FOR UPDATE to serialize concurrent requests
			const lockResult = await tx.execute(
				sql`SELECT id, status, mode, pay_bonus_percent FROM bid_windows WHERE id = ${bidWindowId} FOR UPDATE`
			);
			const windowRow = (lockResult as { rows?: Array<Record<string, unknown>> }).rows?.[0];

			if (!windowRow || windowRow.status !== 'open') {
				return { instantlyAssigned: false, error: 'Route already assigned' };
			}

			const resolvedAt = new Date();

			// Create winning bid
			const [assignment] = await tx
				.select({ date: assignments.date })
				.from(assignments)
				.where(eq(assignments.id, assignmentId));

			// Same-day conflict guard
			const [existingSameDay] = await tx
				.select({ id: assignments.id })
				.from(assignments)
				.where(
					and(
						eq(assignments.userId, userId),
						eq(assignments.date, assignment.date),
						ne(assignments.id, assignmentId),
						ne(assignments.status, 'cancelled')
					)
				);
			if (existingSameDay) {
				return { instantlyAssigned: false, error: 'You already have a shift on this date' };
			}

			const shiftStart = getShiftStartTime(assignment.date);

			const [bid] = await tx
				.insert(bids)
				.values({
					assignmentId,
					userId,
					score: null,
					status: 'won',
					bidAt: resolvedAt,
					windowClosesAt: shiftStart,
					resolvedAt
				})
				.returning({ id: bids.id });

			// Assign driver to assignment
			await tx
				.update(assignments)
				.set({
					userId,
					status: 'scheduled',
					assignedBy: 'bid',
					assignedAt: resolvedAt,
					updatedAt: resolvedAt
				})
				.where(eq(assignments.id, assignmentId));

			// Resolve window
			await tx
				.update(bidWindows)
				.set({ status: 'resolved', winnerId: userId })
				.where(eq(bidWindows.id, bidWindowId));

			// Delete any incomplete shift record (reassignment case)
			await tx.delete(shifts).where(eq(shifts.assignmentId, assignmentId));

			// Mark other pending bids as lost
			await tx
				.update(bids)
				.set({ status: 'lost', resolvedAt })
				.where(
					and(eq(bids.assignmentId, assignmentId), eq(bids.status, 'pending'), ne(bids.id, bid.id))
				);

			// Increment bidPickups metric
			await tx
				.update(driverMetrics)
				.set({
					bidPickups: sql`${driverMetrics.bidPickups} + 1`,
					updatedAt: resolvedAt
				})
				.where(eq(driverMetrics.userId, userId));

			// Increment urgentPickups for instant/emergency mode bid windows
			const windowMode = windowRow.mode as string;
			if (windowMode === 'instant' || windowMode === 'emergency') {
				await tx
					.update(driverMetrics)
					.set({
						urgentPickups: sql`${driverMetrics.urgentPickups} + 1`,
						updatedAt: resolvedAt
					})
					.where(eq(driverMetrics.userId, userId));
			}

			await createAuditLog(
				{
					entityType: 'assignment',
					entityId: assignmentId,
					action: 'instant_assign',
					actorType: 'user',
					actorId: userId,
					changes: {
						before: { status: 'unfilled' },
						after: { status: 'scheduled', userId, assignedBy: 'bid' },
						bidWindowId,
						mode: 'instant'
					}
				},
				tx
			);

			return {
				instantlyAssigned: true,
				bidId: bid.id,
				assignmentId
			};
		});
	} catch (err) {
		log.error({ errorMessage: toSafeErrorMessage(err) }, 'Instant assign failed');
		return { instantlyAssigned: false, error: 'Route already assigned' };
	}
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
