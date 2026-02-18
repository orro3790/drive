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
import { addHours, differenceInMonths, parseISO } from 'date-fns';
import logger, { toSafeErrorMessage } from '$lib/server/logger';
import { getWeekStart, canDriverTakeAssignment } from './scheduling';
import {
	broadcastAssignmentUpdated,
	broadcastBidWindowClosed,
	broadcastBidWindowOpened
} from '$lib/server/realtime/managerSse';
import { calculateBidScoreParts, dispatchPolicy } from '$lib/config/dispatchPolicy';
import { getTorontoDateTimeInstant, toTorontoDateString } from '$lib/server/time/toronto';

const INSTANT_MODE_CUTOFF_MS = dispatchPolicy.bidding.instantModeCutoffHours * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = '23505';
const PG_SERIALIZATION_FAILURE = '40001';
const OPEN_WINDOW_CONSTRAINT = 'uq_bid_windows_open_assignment';
const ACTIVE_ASSIGNMENT_CONSTRAINT = 'uq_assignments_active_user_date';

function formatRouteStartTimeLabel(startTime: string | null | undefined): string {
	if (!startTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
		return '9:00 AM';
	}

	const [hour24, minute] = startTime.split(':').map(Number);
	const period = hour24 >= 12 ? 'PM' : 'AM';
	const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

	return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export type BidWindowMode = 'competitive' | 'instant' | 'emergency';
export type BidWindowTrigger = 'cancellation' | 'auto_drop' | 'no_show' | 'manager';

export interface CreateBidWindowResult {
	success: boolean;
	bidWindowId?: string;
	reason?: string;
	notifiedCount?: number;
}

export interface CreateBidWindowOptions {
	organizationId?: string;
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
 * Get the current time instant.
 *
 * Important: this is an instant used for comparisons against other instants.
 * Do NOT use date-fns-tz's toZonedTime for comparisons; it changes the instant.
 */
function getNowToronto(): Date {
	return new Date();
}

/**
 * Convert an assignment date string to the shift start instant.
 *
 * Shift start is defined as 07:00 Toronto local time.
 */
function getShiftStartTime(dateString: string): Date {
	return getTorontoDateTimeInstant(dateString, {
		hours: dispatchPolicy.shifts.startHourLocal,
		minutes: 0,
		seconds: 0
	});
}

function getTorontoEndOfDayInstant(instant: Date): Date {
	const torontoDate = toTorontoDateString(instant);
	return getTorontoDateTimeInstant(torontoDate, { hours: 23, minutes: 59, seconds: 0 });
}

function getErrorLogContext(error: unknown): {
	errorName: string;
	errorMessage: string;
	errorCode?: string;
} {
	const errorName = error instanceof Error ? error.name || 'Error' : 'UnknownError';
	const fallbackMessage = toSafeErrorMessage(error);
	const errorMessage =
		error instanceof Error && error.message.trim().length > 0 ? error.message : fallbackMessage;
	const errorCode =
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		typeof (error as { code?: unknown }).code === 'string'
			? ((error as { code: string }).code ?? undefined)
			: undefined;

	return { errorName, errorMessage, errorCode };
}

function getPgConstraintName(error: unknown): string | undefined {
	if (
		typeof error === 'object' &&
		error !== null &&
		'constraint' in error &&
		typeof (error as { constraint?: unknown }).constraint === 'string'
	) {
		return (error as { constraint: string }).constraint;
	}

	return undefined;
}

function isPgUniqueViolation(error: unknown, constraint?: string): boolean {
	const errorCode =
		typeof error === 'object' && error !== null && 'code' in error
			? (error as { code?: unknown }).code
			: undefined;

	if (errorCode !== PG_UNIQUE_VIOLATION) {
		return false;
	}

	if (!constraint) {
		return true;
	}

	return getPgConstraintName(error) === constraint;
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
		const closesAt = shiftStart > now ? shiftStart : getTorontoEndOfDayInstant(now);
		return { mode: 'emergency', closesAt };
	}

	// If shift already passed
	if (shiftStart <= now) {
		if (options.allowPastShift) {
			return { mode: 'instant', closesAt: getTorontoEndOfDayInstant(now) };
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
	const assignmentConditions = [eq(assignments.id, assignmentId)];
	if (options.organizationId) {
		assignmentConditions.push(eq(warehouses.organizationId, options.organizationId));
	}

	const [assignment] = await db
		.select({
			id: assignments.id,
			routeId: assignments.routeId,
			date: assignments.date,
			status: assignments.status,
			userId: assignments.userId,
			organizationId: warehouses.organizationId
		})
		.from(assignments)
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(and(...assignmentConditions));

	if (!assignment) {
		log.warn('Assignment not found');
		return { success: false, reason: 'Assignment not found' };
	}

	if (!assignment.organizationId) {
		log.warn('Assignment has no organization scope');
		return { success: false, reason: 'Assignment organization missing' };
	}

	const organizationId = assignment.organizationId;

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
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(and(eq(routes.id, assignment.routeId), eq(warehouses.organizationId, organizationId)));
	const routeName = route?.name ?? 'Unknown Route';

	let bidWindowId: string;

	try {
		const transactionResult = await db.transaction(async (tx) => {
			if (assignment.status !== 'unfilled' || assignment.userId !== null) {
				const updatedAt = new Date();
				await tx
					.update(assignments)
					.set({ status: 'unfilled', userId: null, updatedAt })
					.where(eq(assignments.id, assignmentId));

				await createAuditLog(
					{
						entityType: 'assignment',
						entityId: assignmentId,
						action: 'unfilled',
						actorType: 'system',
						actorId: null,
						changes: {
							before: { status: assignment.status, userId: assignment.userId },
							after: { status: 'unfilled', userId: null },
							reason: 'bid_window_opened',
							trigger: options.trigger
						}
					},
					tx
				);
			}

			const [bidWindow] = await tx
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

			if (!bidWindow) {
				throw new Error('Bid window insert returned no rows');
			}

			return { bidWindowId: bidWindow.id };
		});

		bidWindowId = transactionResult.bidWindowId;
	} catch (err) {
		if (isPgUniqueViolation(err, OPEN_WINDOW_CONSTRAINT)) {
			log.info('Open bid window already exists');
			return { success: false, reason: 'Open bid window already exists for this assignment' };
		}

		log.error(getErrorLogContext(err), 'Failed to create bid window');
		return { success: false, reason: 'Failed to create bid window' };
	}

	log.info({ mode, closesAt }, 'Bid window created');

	let notifiedCount = 0;
	try {
		notifiedCount = await notifyEligibleDrivers({
			organizationId,
			assignmentId,
			assignmentDate: assignment.date,
			routeName,
			closesAt,
			mode,
			payBonusPercent: options.payBonusPercent ?? 0
		});
	} catch (err) {
		log.warn(
			getErrorLogContext(err),
			'Eligible driver fanout failed after durable bid window create'
		);
	}

	try {
		broadcastBidWindowOpened(organizationId, {
			assignmentId,
			routeId: assignment.routeId,
			routeName,
			assignmentDate: assignment.date,
			closesAt: closesAt.toISOString()
		});
	} catch (err) {
		log.warn(getErrorLogContext(err), 'Bid window open broadcast failed after durable create');
	}

	try {
		broadcastAssignmentUpdated(organizationId, {
			assignmentId,
			status: 'unfilled',
			driverId: null,
			driverName: null,
			routeId: assignment.routeId,
			bidWindowClosesAt: closesAt.toISOString()
		});
	} catch (err) {
		log.warn(getErrorLogContext(err), 'Assignment update broadcast failed after durable create');
	}

	return {
		success: true,
		bidWindowId,
		notifiedCount
	};
}

interface NotifyEligibleDriversParams {
	organizationId: string;
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
	const {
		organizationId,
		assignmentId,
		assignmentDate,
		routeName,
		closesAt,
		mode,
		payBonusPercent
	} = params;
	const log = logger.child({ operation: 'notifyEligibleDrivers', mode });

	if (!organizationId) {
		return 0;
	}

	const drivers = await db
		.select({ id: user.id })
		.from(user)
		.where(
			and(
				eq(user.role, 'driver'),
				eq(user.isFlagged, false),
				eq(user.organizationId, organizationId)
			)
		);

	if (drivers.length === 0) {
		log.info('No eligible drivers found');
		return 0;
	}

	const assignmentWeekStart = getWeekStart(parseISO(assignmentDate));

	const eligibleDriverIds: string[] = [];
	for (const driver of drivers) {
		const canTake = await canDriverTakeAssignment(driver.id, assignmentWeekStart, organizationId);
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
		organizationId,
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

async function calculateBidScore(
	userId: string,
	routeId: string,
	organizationId: string
): Promise<number> {
	if (!organizationId) {
		return 0;
	}

	const [healthState] = await db
		.select({ currentScore: driverHealthState.currentScore })
		.from(driverHealthState)
		.where(eq(driverHealthState.userId, userId));

	const [driver] = await db
		.select({ createdAt: user.createdAt })
		.from(user)
		.where(and(eq(user.id, userId), eq(user.organizationId, organizationId)));

	const [routeFamiliarity] = await db
		.select({ completionCount: routeCompletions.completionCount })
		.from(routeCompletions)
		.innerJoin(routes, eq(routeCompletions.routeId, routes.id))
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(
			and(
				eq(routeCompletions.userId, userId),
				eq(routeCompletions.routeId, routeId),
				eq(warehouses.organizationId, organizationId)
			)
		);

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
	actor: AuditActor = { actorType: 'system', actorId: null },
	organizationId?: string
): Promise<ResolveBidWindowResult> {
	const log = logger.child({ operation: 'resolveBidWindow' });
	const windowConditions = [eq(bidWindows.id, bidWindowId)];
	if (organizationId) {
		windowConditions.push(eq(warehouses.organizationId, organizationId));
	}

	const [window] = await db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			status: bidWindows.status,
			mode: bidWindows.mode,
			organizationId: warehouses.organizationId
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(and(...windowConditions));

	if (!window || !window.organizationId) {
		log.warn('Bid window not found');
		return { resolved: false, bidCount: 0, reason: 'not_found' };
	}

	const windowOrganizationId = window.organizationId;

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
			routeStartTime: routes.startTime,
			status: assignments.status,
			userId: assignments.userId,
			organizationId: warehouses.organizationId
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.id, window.assignmentId),
				eq(warehouses.organizationId, windowOrganizationId)
			)
		);

	if (!assignment || !assignment.organizationId) {
		log.warn('Assignment not found');
		return { resolved: false, bidCount: 0, reason: 'assignment_not_found' };
	}

	const assignmentOrganizationId = assignment.organizationId;

	const finalizeWithoutWinner = async (
		reason: 'no_bids' | 'all_bidders_conflicted',
		bidCount: number
	): Promise<ResolveBidWindowResult> => {
		if (window.mode === 'competitive') {
			const transitioned = await transitionToInstantMode(bidWindowId, assignmentOrganizationId);
			if (transitioned) {
				return {
					resolved: false,
					bidCount,
					reason: 'transitioned_to_instant',
					transitioned: true
				};
			}

			return { resolved: false, bidCount, reason: 'not_open' };
		}

		const [closedWindow] = await db
			.update(bidWindows)
			.set({ status: 'closed' })
			.where(and(eq(bidWindows.id, bidWindowId), eq(bidWindows.status, 'open')))
			.returning({ id: bidWindows.id });

		if (!closedWindow) {
			return { resolved: false, bidCount, reason: 'not_open' };
		}

		try {
			await sendManagerAlert(
				assignment.routeId,
				'route_unfilled',
				{
					routeName: assignment.routeName,
					date: assignment.date,
					routeStartTime: assignment.routeStartTime ?? undefined
				},
				assignmentOrganizationId
			);
		} catch (err) {
			log.warn(getErrorLogContext(err), 'Manager alert failed after closing bid window');
		}

		return { resolved: false, bidCount, reason };
	};

	const pendingBids = await db
		.select({
			id: bids.id,
			userId: bids.userId,
			bidAt: bids.bidAt
		})
		.from(bids)
		.where(and(eq(bids.bidWindowId, bidWindowId), eq(bids.status, 'pending')));

	if (pendingBids.length === 0) {
		log.info('No bids to resolve');
		return finalizeWithoutWinner('no_bids', 0);
	}

	const scoredBids = await Promise.all(
		pendingBids.map(async (bid) => ({
			...bid,
			score: await calculateBidScore(bid.userId, assignment.routeId, assignmentOrganizationId)
		}))
	);

	scoredBids.sort((a, b) => {
		if (b.score !== a.score) {
			return b.score - a.score;
		}

		const bidAtDiff = a.bidAt.getTime() - b.bidAt.getTime();
		if (bidAtDiff !== 0) {
			return bidAtDiff;
		}

		return a.id.localeCompare(b.id);
	});

	// Same-day conflict guard: check which bidders already have an assignment for this date
	const bidderIds = scoredBids.map((b) => b.userId);
	const conflicts = await db
		.select({ userId: assignments.userId })
		.from(assignments)
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				inArray(assignments.userId, bidderIds),
				eq(assignments.date, assignment.date),
				ne(assignments.id, assignment.id),
				ne(assignments.status, 'cancelled'),
				eq(warehouses.organizationId, assignmentOrganizationId)
			)
		);
	const conflictSet = new Set(conflicts.map((c) => c.userId));

	while (true) {
		const winner = scoredBids.find((bid) => !conflictSet.has(bid.userId));

		if (!winner) {
			log.info('All bidders have same-day conflicts');
			return finalizeWithoutWinner('all_bidders_conflicted', scoredBids.length);
		}

		const resolvedAt = new Date();
		const transactionResult = await db
			.transaction(async (tx) => {
				const lockResult = await tx.execute(
					sql`SELECT id, status FROM bid_windows WHERE id = ${bidWindowId} FOR UPDATE`
				);
				const lockedWindow = (lockResult as { rows?: Array<Record<string, unknown>> }).rows?.[0];

				if (!lockedWindow || lockedWindow.status !== 'open') {
					return { outcome: 'not_open' as const };
				}

				const [updatedWindow] = await tx
					.update(bidWindows)
					.set({ status: 'resolved', winnerId: winner.userId })
					.where(and(eq(bidWindows.id, bidWindowId), eq(bidWindows.status, 'open')))
					.returning({ id: bidWindows.id });

				if (!updatedWindow) {
					return { outcome: 'not_open' as const };
				}

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

				return {
					outcome: 'resolved' as const,
					winnerId: winner.userId
				};
			})
			.catch((err) => {
				if (isPgUniqueViolation(err, ACTIVE_ASSIGNMENT_CONSTRAINT)) {
					return { outcome: 'winner_conflict' as const };
				}

				throw err;
			});

		if (transactionResult.outcome === 'not_open') {
			return { resolved: false, bidCount: 0, reason: 'not_open' };
		}

		if (transactionResult.outcome === 'winner_conflict') {
			conflictSet.add(winner.userId);
			continue;
		}

		const formattedDate = assignment.date;
		const routeStartTimeLabel = formatRouteStartTimeLabel(assignment.routeStartTime);
		const winnerBody = `You won ${assignment.routeName} for ${formattedDate} at ${routeStartTimeLabel}`;
		const loserBody = `${assignment.routeName} at ${routeStartTimeLabel} was assigned to another driver`;
		const notificationData = {
			assignmentId: assignment.id,
			bidWindowId,
			routeName: assignment.routeName,
			routeStartTime: assignment.routeStartTime,
			assignmentDate: formattedDate
		};

		try {
			await sendNotification(transactionResult.winnerId, 'bid_won', {
				customBody: winnerBody,
				data: notificationData,
				organizationId: assignmentOrganizationId
			});
		} catch (err) {
			log.warn(getErrorLogContext(err), 'Winner notification failed');
		}

		const loserIds = scoredBids.filter((bid) => bid.id !== winner.id).map((bid) => bid.userId);
		if (loserIds.length > 0) {
			try {
				await sendBulkNotifications(loserIds, 'bid_lost', {
					customBody: loserBody,
					data: notificationData,
					organizationId: assignmentOrganizationId
				});
			} catch (err) {
				log.warn(getErrorLogContext(err), 'Loser notifications failed');
			}
		}

		try {
			broadcastBidWindowClosed(assignmentOrganizationId, {
				assignmentId: assignment.id,
				bidWindowId,
				winnerId: transactionResult.winnerId
			});
		} catch (err) {
			log.warn(getErrorLogContext(err), 'Bid window close broadcast failed');
		}

		try {
			broadcastAssignmentUpdated(assignmentOrganizationId, {
				assignmentId: assignment.id,
				status: 'scheduled',
				driverId: transactionResult.winnerId,
				routeId: assignment.routeId
			});
		} catch (err) {
			log.warn(getErrorLogContext(err), 'Assignment update broadcast failed');
		}

		log.info({ bidCount: scoredBids.length }, 'Bid window resolved');

		return {
			resolved: true,
			bidCount: scoredBids.length,
			winnerId: transactionResult.winnerId
		};
	}
}

/**
 * Get all open bid windows that have passed their closesAt time.
 * Used by the cron job to resolve expired windows.
 */
export async function getExpiredBidWindows(
	warehouseIds?: string[],
	organizationId?: string
): Promise<Array<{ id: string; assignmentId: string; mode: BidWindowMode }>> {
	const now = new Date();

	if ((!warehouseIds || warehouseIds.length === 0) && !organizationId) {
		return [];
	}

	if (warehouseIds && warehouseIds.length > 0) {
		const scopedConditions = [
			eq(bidWindows.status, 'open'),
			lt(bidWindows.closesAt, now),
			inArray(assignments.warehouseId, warehouseIds)
		];

		if (organizationId) {
			scopedConditions.push(eq(warehouses.organizationId, organizationId));
		}

		return db
			.select({
				id: bidWindows.id,
				assignmentId: bidWindows.assignmentId,
				mode: bidWindows.mode
			})
			.from(bidWindows)
			.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
			.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
			.where(and(...scopedConditions));
	}

	return db
		.select({
			id: bidWindows.id,
			assignmentId: bidWindows.assignmentId,
			mode: bidWindows.mode
		})
		.from(bidWindows)
		.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(bidWindows.status, 'open'),
				lt(bidWindows.closesAt, now),
				eq(warehouses.organizationId, organizationId ?? '')
			)
		);
}

/**
 * Transition a competitive bid window to instant mode.
 * Called when a competitive window expires with no bids.
 */
export async function transitionToInstantMode(
	bidWindowId: string,
	organizationId?: string
): Promise<boolean> {
	const log = logger.child({ operation: 'transitionToInstantMode' });

	if (!organizationId) {
		return false;
	}

	const transitionResult = await db.transaction(async (tx) => {
		const lockResult = await tx.execute(
			sql`SELECT id, assignment_id, status, mode FROM bid_windows WHERE id = ${bidWindowId} FOR UPDATE`
		);
		const windowRow = (lockResult as { rows?: Array<Record<string, unknown>> }).rows?.[0];

		if (!windowRow) {
			return { outcome: 'not_found' as const };
		}

		if (windowRow.status !== 'open') {
			return { outcome: 'not_open' as const };
		}

		if (windowRow.mode !== 'competitive') {
			return { outcome: 'not_competitive' as const };
		}

		const assignmentId = String(windowRow.assignment_id);

		const [assignment] = await tx
			.select({
				date: assignments.date,
				routeId: assignments.routeId,
				organizationId: warehouses.organizationId
			})
			.from(assignments)
			.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
			.where(and(eq(assignments.id, assignmentId), eq(warehouses.organizationId, organizationId)));

		if (!assignment || !assignment.organizationId) {
			return { outcome: 'assignment_not_found' as const };
		}

		const shiftStart = getShiftStartTime(assignment.date);

		if (shiftStart <= new Date()) {
			const [closedWindow] = await tx
				.update(bidWindows)
				.set({ status: 'closed' })
				.where(and(eq(bidWindows.id, bidWindowId), eq(bidWindows.status, 'open')))
				.returning({ id: bidWindows.id });

			if (!closedWindow) {
				return { outcome: 'not_open' as const };
			}

			return { outcome: 'closed' as const };
		}

		const [updatedWindow] = await tx
			.update(bidWindows)
			.set({ mode: 'instant', closesAt: shiftStart })
			.where(
				and(
					eq(bidWindows.id, bidWindowId),
					eq(bidWindows.status, 'open'),
					eq(bidWindows.mode, 'competitive')
				)
			)
			.returning({ id: bidWindows.id });

		if (!updatedWindow) {
			return { outcome: 'not_open' as const };
		}

		return {
			outcome: 'transitioned' as const,
			assignmentId,
			assignmentDate: assignment.date,
			routeId: assignment.routeId,
			organizationId: assignment.organizationId,
			shiftStart
		};
	});

	if (transitionResult.outcome === 'not_found') {
		log.warn('Bid window not found');
		return false;
	}

	if (transitionResult.outcome === 'assignment_not_found') {
		log.warn('Assignment not found for transition');
		return false;
	}

	if (transitionResult.outcome === 'closed') {
		log.info('Shift already started, closed window');
		return false;
	}

	if (transitionResult.outcome !== 'transitioned') {
		return false;
	}

	const [route] = await db
		.select({ name: routes.name })
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(
			and(
				eq(routes.id, transitionResult.routeId),
				eq(warehouses.organizationId, transitionResult.organizationId)
			)
		);
	const routeName = route?.name ?? 'Unknown Route';

	await notifyEligibleDrivers({
		organizationId: transitionResult.organizationId,
		assignmentId: transitionResult.assignmentId,
		assignmentDate: transitionResult.assignmentDate,
		routeName,
		closesAt: transitionResult.shiftStart,
		mode: 'instant',
		payBonusPercent: 0
	});

	log.info('Transitioned to instant mode');
	return true;
}

/**
 * Instantly assign a driver to an assignment via an instant/emergency bid window.
 * Uses SELECT FOR UPDATE to prevent race conditions.
 */
export async function instantAssign(
	assignmentId: string,
	userId: string,
	bidWindowId: string,
	organizationId?: string
): Promise<InstantAssignResult> {
	const log = logger.child({ operation: 'instantAssign' });

	try {
		if (organizationId) {
			const [scopedAssignment] = await db
				.select({ id: assignments.id })
				.from(assignments)
				.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
				.where(and(eq(assignments.id, assignmentId), eq(warehouses.organizationId, organizationId)))
				.limit(1);

			if (!scopedAssignment) {
				return { instantlyAssigned: false, error: 'Route already assigned' };
			}
		}

		const transactionResult = await db.transaction(async (tx) => {
			// Lock the bid window row with FOR UPDATE to serialize concurrent requests
			const lockResult = await tx.execute(
				sql`SELECT id, status, mode, pay_bonus_percent FROM bid_windows WHERE id = ${bidWindowId} FOR UPDATE`
			);
			const windowRow = (lockResult as { rows?: Array<Record<string, unknown>> }).rows?.[0];

			if (!windowRow || windowRow.status !== 'open') {
				return { instantlyAssigned: false, error: 'Route already assigned' };
			}

			const resolvedAt = new Date();

			const assignmentConditions = [eq(assignments.id, assignmentId)];
			if (organizationId) {
				assignmentConditions.push(eq(warehouses.organizationId, organizationId));
			}

			// Create winning bid
			const [assignment] = await tx
				.select({ date: assignments.date })
				.from(assignments)
				.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
				.where(and(...assignmentConditions));

			if (!assignment) {
				return { instantlyAssigned: false, error: 'Route already assigned' };
			}

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
					bidWindowId,
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
				.where(and(eq(bidWindows.id, bidWindowId), eq(bidWindows.status, 'open')));

			// Delete any incomplete shift record (reassignment case)
			await tx.delete(shifts).where(eq(shifts.assignmentId, assignmentId));

			// Mark other pending bids as lost
			await tx
				.update(bids)
				.set({ status: 'lost', resolvedAt })
				.where(
					and(eq(bids.bidWindowId, bidWindowId), eq(bids.status, 'pending'), ne(bids.id, bid.id))
				);

			// Increment bidPickups metric
			await tx
				.update(driverMetrics)
				.set({
					bidPickups: sql`${driverMetrics.bidPickups} + 1`,
					updatedAt: resolvedAt
				})
				.where(eq(driverMetrics.userId, userId));

			const windowMode = windowRow.mode as BidWindowMode;

			return {
				instantlyAssigned: true,
				bidId: bid.id,
				assignmentId,
				windowMode,
				resolvedAt
			};
		});

		if (!transactionResult.instantlyAssigned) {
			return transactionResult;
		}

		if (
			transactionResult.windowMode === 'instant' ||
			transactionResult.windowMode === 'emergency'
		) {
			try {
				await db
					.update(driverMetrics)
					.set({
						urgentPickups: sql`${driverMetrics.urgentPickups} + 1`,
						updatedAt: transactionResult.resolvedAt
					})
					.where(eq(driverMetrics.userId, userId));
			} catch (err) {
				log.warn(getErrorLogContext(err), 'Urgent pickup metric update failed');
			}
		}

		try {
			await createAuditLog({
				entityType: 'assignment',
				entityId: assignmentId,
				action: 'instant_assign',
				actorType: 'user',
				actorId: userId,
				changes: {
					before: { status: 'unfilled' },
					after: { status: 'scheduled', userId, assignedBy: 'bid' },
					bidWindowId,
					mode: transactionResult.windowMode
				}
			});
		} catch (err) {
			log.warn(getErrorLogContext(err), 'Instant assignment audit log failed');
		}

		return {
			instantlyAssigned: true,
			bidId: transactionResult.bidId,
			assignmentId: transactionResult.assignmentId
		};
	} catch (err) {
		const errorContext = getErrorLogContext(err);
		const errorMessageLower = errorContext.errorMessage.toLowerCase();
		const isLikelyRaceCondition =
			errorContext.errorCode === PG_SERIALIZATION_FAILURE ||
			errorMessageLower.includes('serialization') ||
			errorMessageLower.includes('deadlock');
		const hasActiveShiftConflict = isPgUniqueViolation(err, ACTIVE_ASSIGNMENT_CONSTRAINT);

		log.error(errorContext, 'Instant assign failed');
		return {
			instantlyAssigned: false,
			error: hasActiveShiftConflict
				? 'You already have a shift on this date'
				: isLikelyRaceCondition
					? 'Route already assigned'
					: 'Unable to accept shift right now'
		};
	}
}

export async function getBidWindowDetail(windowId: string, organizationId?: string) {
	const detailConditions = [eq(bidWindows.id, windowId)];
	if (organizationId) {
		detailConditions.push(eq(warehouses.organizationId, organizationId));
	}

	const bidCountSubquery = db
		.select({
			bidWindowId: bids.bidWindowId,
			count: sql<number>`count(*)`.as('count')
		})
		.from(bids)
		.groupBy(bids.bidWindowId)
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
		.leftJoin(bidCountSubquery, eq(bidCountSubquery.bidWindowId, bidWindows.id))
		.where(and(...detailConditions));

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
