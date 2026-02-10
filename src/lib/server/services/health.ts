/**
 * Driver Health Service
 *
 * Additive point-based scoring and weekly 0-4 star progression with hard-stop resets.
 * Each shift event earns/costs discrete points. Score accumulates since last reset.
 * Tier II activates at 96 points (= 1 perfect month of 4 shifts/week × 4 weeks × 6 pts/shift).
 *
 * See documentation/plans/driver-health-gamification.md for full specification.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	bidWindows,
	bids,
	driverHealthSnapshots,
	driverHealthState,
	driverMetrics,
	notifications,
	routes,
	shifts,
	user
} from '$lib/server/db/schema';
import { and, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';
import { subDays, startOfWeek, endOfWeek } from 'date-fns';
import logger from '$lib/server/logger';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { createAuditLog } from '$lib/server/services/audit';
import { sendNotification } from '$lib/server/services/notifications';
import type { HealthContributions } from '$lib/schemas/health';

const TORONTO_TZ = dispatchPolicy.timezone.toronto;
const HARD_STOP_SCORE_CAP = 49;

function sameTimestamp(a: Date | null | undefined, b: Date | null | undefined): boolean {
	return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

function torontoToday(): string {
	return format(toZonedTime(new Date(), TORONTO_TZ), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// Rolling-window event counts (for hard-stop / pool eligibility checks)
// ---------------------------------------------------------------------------

interface RollingCounts {
	noShowCount30d: number;
	lateCancellationCount30d: number;
}

/**
 * Count no-shows and late cancellations for a driver in the last N days.
 */
async function getRollingCounts(userId: string, windowDays: number): Promise<RollingCounts> {
	const now = new Date();
	const nowToronto = toZonedTime(now, TORONTO_TZ);
	const cutoffDate = format(subDays(nowToronto, windowDays), 'yyyy-MM-dd');
	const cutoffInstant = subDays(now, windowDays);
	const todayStr = format(nowToronto, 'yyyy-MM-dd');

	const [noShowResult] = await db
		.select({ count: sql<number>`count(distinct ${assignments.id})::int` })
		.from(assignments)
		.innerJoin(
			bidWindows,
			and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.trigger, 'no_show'))
		)
		.where(
			and(
				eq(assignments.userId, userId),
				gte(assignments.date, cutoffDate),
				lte(assignments.date, todayStr)
			)
		);

	const [lateCancelResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				eq(assignments.status, 'cancelled'),
				eq(assignments.cancelType, 'late'),
				isNotNull(assignments.confirmedAt),
				isNotNull(assignments.cancelledAt),
				gte(assignments.cancelledAt, cutoffInstant),
				lte(assignments.cancelledAt, now)
			)
		);

	return {
		noShowCount30d: noShowResult?.count ?? 0,
		lateCancellationCount30d: lateCancelResult?.count ?? 0
	};
}

/**
 * Check whether any hard-stop events occurred after a given date.
 */
async function hasNewHardStopEvents(userId: string, afterDate: Date): Promise<boolean> {
	const [noShowResult] = await db
		.select({ count: sql<number>`count(distinct ${assignments.id})::int` })
		.from(assignments)
		.innerJoin(
			bidWindows,
			and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.trigger, 'no_show'))
		)
		.where(and(eq(assignments.userId, userId), sql`${bidWindows.opensAt} > ${afterDate}`));

	const [lateCancelResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				eq(assignments.status, 'cancelled'),
				eq(assignments.cancelType, 'late'),
				isNotNull(assignments.confirmedAt),
				isNotNull(assignments.cancelledAt),
				sql`${assignments.cancelledAt} > ${afterDate}`
			)
		);

	const newNoShows = noShowResult?.count ?? 0;
	const newLateCancels = lateCancelResult?.count ?? 0;

	return newNoShows > 0 || newLateCancels >= dispatchPolicy.health.lateCancelThreshold;
}

// ---------------------------------------------------------------------------
// Additive contribution computation
// ---------------------------------------------------------------------------

/**
 * Compute additive point contributions for a driver since their last score reset.
 * Returns the breakdown of each event type and the total score (floored at 0).
 */
export async function computeContributions(userId: string): Promise<{
	contributions: HealthContributions;
	score: number;
	lastScoreResetAt: Date | null;
}> {
	const pts = dispatchPolicy.health.points;

	// Get lastScoreResetAt from health state (null = count from all time)
	const [stateRow] = await db
		.select({ lastScoreResetAt: driverHealthState.lastScoreResetAt })
		.from(driverHealthState)
		.where(eq(driverHealthState.userId, userId));

	const sinceDate = stateRow?.lastScoreResetAt
		? format(stateRow.lastScoreResetAt, 'yyyy-MM-dd')
		: '1970-01-01';

	const todayStr = torontoToday();

	// Run all count queries in parallel
	const [
		confirmedResult,
		arrivedOnTimeResult,
		completedResult,
		highDeliveryResult,
		autoDropResult,
		lateCancelResult,
		bidPickupResult,
		urgentPickupResult
	] = await Promise.all([
		// Confirmed on time: assignments with confirmedAt, active statuses, since date
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(assignments)
			.where(
				and(
					eq(assignments.userId, userId),
					isNotNull(assignments.confirmedAt),
					sql`${assignments.status} IN ('scheduled', 'active', 'completed')`,
					gte(assignments.date, sinceDate),
					lte(assignments.date, todayStr)
				)
			),

		// Arrived on time: shifts with arrivedAt before route's start time
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(shifts)
			.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
			.innerJoin(routes, eq(assignments.routeId, routes.id))
			.where(
				and(
					eq(assignments.userId, userId),
					isNotNull(shifts.arrivedAt),
					sql`${shifts.arrivedAt} < (${assignments.date}::date + coalesce(${routes.startTime}, '09:00')::time) AT TIME ZONE 'America/Toronto'`,
					gte(assignments.date, sinceDate),
					lte(assignments.date, todayStr)
				)
			),

		// Completed shifts
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(shifts)
			.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
			.where(
				and(
					eq(assignments.userId, userId),
					isNotNull(shifts.completedAt),
					gte(assignments.date, sinceDate),
					lte(assignments.date, todayStr)
				)
			),

		// High delivery (95%+): adjusted for excepted returns
		// Formula: (parcelsStart - parcelsReturned + exceptedReturns) / parcelsStart >= 0.95
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(shifts)
			.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
			.where(
				and(
					eq(assignments.userId, userId),
					isNotNull(shifts.completedAt),
					isNotNull(shifts.parcelsStart),
					sql`${shifts.parcelsStart} > 0`,
					sql`(${shifts.parcelsStart} - coalesce(${shifts.parcelsReturned}, 0) + coalesce(${shifts.exceptedReturns}, 0))::float / ${shifts.parcelsStart} >= 0.95`,
					gte(assignments.date, sinceDate),
					lte(assignments.date, todayStr)
				)
			),

		// Auto-drops
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(assignments)
			.where(
				and(
					eq(assignments.userId, userId),
					sql`${assignments.cancelType} = 'auto_drop'`,
					gte(assignments.date, sinceDate),
					lte(assignments.date, todayStr)
				)
			),

		// Late cancellations
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(assignments)
			.where(
				and(
					eq(assignments.userId, userId),
					sql`${assignments.cancelType} = 'late'`,
					gte(assignments.date, sinceDate),
					lte(assignments.date, todayStr)
				)
			),

		// Bid pickups (competitive mode)
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(bids)
			.innerJoin(bidWindows, eq(bidWindows.id, bids.bidWindowId))
			.where(
				and(
					eq(bids.userId, userId),
					eq(bids.status, 'won'),
					eq(bidWindows.mode, 'competitive'),
					gte(bids.bidAt, stateRow?.lastScoreResetAt ?? new Date('1970-01-01'))
				)
			),

		// Urgent pickups (instant/emergency mode)
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(bids)
			.innerJoin(bidWindows, eq(bidWindows.id, bids.bidWindowId))
			.where(
				and(
					eq(bids.userId, userId),
					eq(bids.status, 'won'),
					sql`${bidWindows.mode} IN ('instant', 'emergency')`,
					gte(bids.bidAt, stateRow?.lastScoreResetAt ?? new Date('1970-01-01'))
				)
			)
	]);

	const confirmedCount = confirmedResult[0]?.count ?? 0;
	const arrivedOnTimeCount = arrivedOnTimeResult[0]?.count ?? 0;
	const completedCount = completedResult[0]?.count ?? 0;
	const highDeliveryCount = highDeliveryResult[0]?.count ?? 0;
	const autoDropCount = autoDropResult[0]?.count ?? 0;
	const lateCancelCount = lateCancelResult[0]?.count ?? 0;
	const bidPickupCount = bidPickupResult[0]?.count ?? 0;
	const urgentPickupCount = urgentPickupResult[0]?.count ?? 0;

	const contributions: HealthContributions = {
		confirmedOnTime: { count: confirmedCount, points: confirmedCount * pts.confirmedOnTime },
		arrivedOnTime: { count: arrivedOnTimeCount, points: arrivedOnTimeCount * pts.arrivedOnTime },
		completedShifts: { count: completedCount, points: completedCount * pts.completedShift },
		highDelivery: { count: highDeliveryCount, points: highDeliveryCount * pts.highDelivery },
		bidPickups: { count: bidPickupCount, points: bidPickupCount * pts.bidPickup },
		urgentPickups: { count: urgentPickupCount, points: urgentPickupCount * pts.urgentPickup },
		autoDrops: { count: autoDropCount, points: autoDropCount * pts.autoDrop },
		lateCancellations: { count: lateCancelCount, points: lateCancelCount * pts.lateCancel }
	};

	const rawTotal = Object.values(contributions).reduce((sum, line) => sum + line.points, 0);
	const score = Math.max(0, rawTotal);

	return {
		contributions,
		score,
		lastScoreResetAt: stateRow?.lastScoreResetAt ?? null
	};
}

// ---------------------------------------------------------------------------
// Daily score computation
// ---------------------------------------------------------------------------

export interface DailyScoreResult {
	userId: string;
	score: number;
	attendanceRate: number;
	completionRate: number;
	contributions: HealthContributions;
	lastScoreResetAt: Date | null;
	noShowCount30d: number;
	lateCancellationCount30d: number;
	hardStopTriggered: boolean;
	reasons: string[];
}

/**
 * Compute the daily health score for a single driver.
 *
 * Score is an additive sum of event points since last reset.
 * Hard-stop: any no-show OR >=2 late cancellations in rolling 30 days
 * triggers pool removal and caps score to 49.
 */
export async function computeDailyScore(userId: string): Promise<DailyScoreResult | null> {
	const [metrics] = await db
		.select({
			totalShifts: driverMetrics.totalShifts,
			attendanceRate: driverMetrics.attendanceRate,
			completionRate: driverMetrics.completionRate
		})
		.from(driverMetrics)
		.where(eq(driverMetrics.userId, userId));

	if (!metrics || metrics.totalShifts === 0) {
		return null;
	}

	const { contributions, score: rawScore, lastScoreResetAt } = await computeContributions(userId);
	const rolling = await getRollingCounts(userId, dispatchPolicy.health.lateCancelRollingDays);
	const reasons: string[] = [];

	const hardStopTriggered =
		rolling.noShowCount30d > 0 ||
		rolling.lateCancellationCount30d >= dispatchPolicy.health.lateCancelThreshold;

	if (hardStopTriggered) {
		if (rolling.noShowCount30d > 0) {
			reasons.push(`No-show in last ${dispatchPolicy.health.lateCancelRollingDays} days`);
		}
		if (rolling.lateCancellationCount30d >= dispatchPolicy.health.lateCancelThreshold) {
			reasons.push(
				`${rolling.lateCancellationCount30d} late cancellations in last ${dispatchPolicy.health.lateCancelRollingDays} days`
			);
		}
	}

	const score = hardStopTriggered ? Math.min(rawScore, HARD_STOP_SCORE_CAP) : rawScore;

	return {
		userId,
		score,
		attendanceRate: metrics.attendanceRate ?? 0,
		completionRate: metrics.completionRate ?? 0,
		contributions,
		lastScoreResetAt,
		noShowCount30d: rolling.noShowCount30d,
		lateCancellationCount30d: rolling.lateCancellationCount30d,
		hardStopTriggered,
		reasons
	};
}

/**
 * Persist daily score snapshot and update current state.
 * Idempotent: upserts on (userId, evaluatedAt).
 */
async function persistDailyScore(result: DailyScoreResult, evaluatedAt: string): Promise<void> {
	const now = new Date();

	await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT user_id FROM driver_health_state WHERE user_id = ${result.userId} FOR UPDATE`
		);

		const [stateBeforeWrite] = await tx
			.select({
				reinstatedAt: driverHealthState.reinstatedAt,
				lastScoreResetAt: driverHealthState.lastScoreResetAt,
				assignmentPoolEligible: driverHealthState.assignmentPoolEligible,
				requiresManagerIntervention: driverHealthState.requiresManagerIntervention
			})
			.from(driverHealthState)
			.where(eq(driverHealthState.userId, result.userId));

		if (!sameTimestamp(stateBeforeWrite?.lastScoreResetAt, result.lastScoreResetAt)) {
			logger.warn(
				{
					userId: result.userId,
					observedLastScoreResetAt: result.lastScoreResetAt?.toISOString() ?? null,
					currentLastScoreResetAt: stateBeforeWrite?.lastScoreResetAt?.toISOString() ?? null
				},
				'Skipping stale daily health write due to reset marker mismatch'
			);
			throw new Error('STALE_DAILY_HEALTH_WRITE');
		}

		await tx
			.insert(driverHealthSnapshots)
			.values({
				userId: result.userId,
				evaluatedAt,
				score: result.score,
				attendanceRate: result.attendanceRate,
				completionRate: result.completionRate,
				lateCancellationCount30d: result.lateCancellationCount30d,
				noShowCount30d: result.noShowCount30d,
				hardStopTriggered: result.hardStopTriggered,
				reasons: result.reasons,
				contributions: result.contributions
			})
			.onConflictDoUpdate({
				target: [driverHealthSnapshots.userId, driverHealthSnapshots.evaluatedAt],
				set: {
					score: result.score,
					attendanceRate: result.attendanceRate,
					completionRate: result.completionRate,
					lateCancellationCount30d: result.lateCancellationCount30d,
					noShowCount30d: result.noShowCount30d,
					hardStopTriggered: result.hardStopTriggered,
					reasons: result.reasons,
					contributions: result.contributions
				}
			});

		const upsertBase: Record<string, unknown> = {
			currentScore: result.score,
			updatedAt: now
		};

		let shouldDisablePool = false;
		let hardStopResetAt: Date | null = null;

		if (result.hardStopTriggered) {
			shouldDisablePool = true;

			if (stateBeforeWrite?.reinstatedAt) {
				const newEvents = await hasNewHardStopEvents(result.userId, stateBeforeWrite.reinstatedAt);
				if (!newEvents) {
					shouldDisablePool = false;
				} else {
					upsertBase.reinstatedAt = null;
				}
			}

			if (shouldDisablePool) {
				const enteringHardStop =
					!stateBeforeWrite ||
					stateBeforeWrite.assignmentPoolEligible ||
					!stateBeforeWrite.requiresManagerIntervention;

				if (enteringHardStop || !stateBeforeWrite?.lastScoreResetAt) {
					hardStopResetAt = now;
					upsertBase.lastScoreResetAt = now;
				}

				Object.assign(upsertBase, {
					assignmentPoolEligible: false,
					requiresManagerIntervention: true,
					stars: 0,
					streakWeeks: 0,
					nextMilestoneStars: 1
				});
			}
		}

		await tx
			.insert(driverHealthState)
			.values({
				userId: result.userId,
				currentScore: result.score,
				assignmentPoolEligible: !shouldDisablePool,
				requiresManagerIntervention: shouldDisablePool,
				updatedAt: now,
				...(hardStopResetAt ? { lastScoreResetAt: hardStopResetAt } : {})
			})
			.onConflictDoUpdate({
				target: driverHealthState.userId,
				set: upsertBase
			});
	});
}

// ---------------------------------------------------------------------------
// Weekly star evaluation
// ---------------------------------------------------------------------------

export interface WeeklyEvalResult {
	userId: string;
	weekStart: string;
	qualified: boolean;
	hardStopReset: boolean;
	neutral: boolean;
	previousStars: number;
	newStars: number;
	previousStreak: number;
	newStreak: number;
	reasons: string[];
}

/**
 * Evaluate a single driver's weekly star progression.
 *
 * A qualifying week requires:
 * - 100% attendance (all assignments completed)
 * - >=95% completion rate
 * - 0 no-shows
 * - 0 late cancellations
 *
 * Zero-assignment weeks are neutral (no increment, no reset).
 * Hard-stop events reset streak to 0 immediately.
 */
export async function evaluateWeek(userId: string, weekStart: Date): Promise<WeeklyEvalResult> {
	const weekStartStr = format(weekStart, 'yyyy-MM-dd');
	const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
	const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

	// Get assignments for this week
	const weekAssignments = await db
		.select({
			id: assignments.id,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt
		})
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				gte(assignments.date, weekStartStr),
				sql`${assignments.date} <= ${weekEndStr}`
			)
		);

	// Get current state
	const [currentState] = await db
		.select()
		.from(driverHealthState)
		.where(eq(driverHealthState.userId, userId));

	const previousStars = currentState?.stars ?? 0;
	const previousStreak = currentState?.streakWeeks ?? 0;
	const reasons: string[] = [];

	// Zero-assignment week = neutral
	if (weekAssignments.length === 0) {
		return {
			userId,
			weekStart: weekStartStr,
			qualified: false,
			hardStopReset: false,
			neutral: true,
			previousStars,
			newStars: previousStars,
			previousStreak,
			newStreak: previousStreak,
			reasons: ['No assignments this week — neutral']
		};
	}

	// Check for hard-stop events in this week's rolling window
	const rolling = await getRollingCounts(userId, dispatchPolicy.health.lateCancelRollingDays);
	const hardStopTriggered =
		rolling.noShowCount30d > 0 ||
		rolling.lateCancellationCount30d >= dispatchPolicy.health.lateCancelThreshold;

	if (hardStopTriggered) {
		const newStreak = 0;
		const newStars = 0;

		if (rolling.noShowCount30d > 0) {
			reasons.push('Hard-stop: no-show in rolling 30 days');
		}
		if (rolling.lateCancellationCount30d >= dispatchPolicy.health.lateCancelThreshold) {
			reasons.push(
				`Hard-stop: ${rolling.lateCancellationCount30d} late cancellations in rolling 30 days`
			);
		}

		return {
			userId,
			weekStart: weekStartStr,
			qualified: false,
			hardStopReset: true,
			neutral: false,
			previousStars,
			newStars,
			previousStreak,
			newStreak,
			reasons
		};
	}

	// Evaluate qualifying criteria
	const completedAssignments = weekAssignments.filter((a) => a.status === 'completed');
	const cancelledAssignments = weekAssignments.filter((a) => a.status === 'cancelled');
	const totalAssignments = weekAssignments.length;

	const nonCancelledCount = totalAssignments - cancelledAssignments.length;
	const weekAttendance =
		nonCancelledCount > 0 ? completedAssignments.length / nonCancelledCount : 0;

	const weekShifts = await db
		.select({
			parcelsStart: shifts.parcelsStart,
			parcelsReturned: shifts.parcelsReturned,
			exceptedReturns: shifts.exceptedReturns
		})
		.from(shifts)
		.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
		.where(
			and(
				eq(assignments.userId, userId),
				gte(assignments.date, weekStartStr),
				sql`${assignments.date} <= ${weekEndStr}`,
				isNotNull(shifts.completedAt),
				isNotNull(shifts.parcelsStart),
				sql`${shifts.parcelsStart} > 0`
			)
		);

	// Adjusted completion: (parcelsStart - parcelsReturned + exceptedReturns) / parcelsStart
	const weekCompletionRate =
		weekShifts.length > 0
			? weekShifts.reduce((sum, s) => {
					const start = s.parcelsStart ?? 1;
					const returned = s.parcelsReturned ?? 0;
					const excepted = s.exceptedReturns ?? 0;
					return sum + (start - returned + excepted) / start;
				}, 0) / weekShifts.length
			: 0;

	const weekNoShows = await db
		.select({ count: sql<number>`count(distinct ${assignments.id})::int` })
		.from(assignments)
		.innerJoin(
			bidWindows,
			and(eq(bidWindows.assignmentId, assignments.id), eq(bidWindows.trigger, 'no_show'))
		)
		.where(
			and(
				eq(assignments.userId, userId),
				gte(assignments.date, weekStartStr),
				sql`${assignments.date} <= ${weekEndStr}`
			)
		);
	const weekNoShowCount = weekNoShows[0]?.count ?? 0;

	const weekLateCancels = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				eq(assignments.status, 'cancelled'),
				eq(assignments.cancelType, 'late'),
				isNotNull(assignments.confirmedAt),
				gte(assignments.date, weekStartStr),
				sql`${assignments.date} <= ${weekEndStr}`
			)
		);
	const weekLateCancelCount = weekLateCancels[0]?.count ?? 0;

	const qw = dispatchPolicy.health.qualifyingWeek;
	const qualified =
		weekAttendance >= qw.minAttendanceRate &&
		weekCompletionRate >= qw.minCompletionRate &&
		weekNoShowCount <= qw.maxNoShows &&
		weekLateCancelCount <= qw.maxLateCancellations;

	if (!qualified) {
		if (weekAttendance < qw.minAttendanceRate) {
			reasons.push(`Attendance ${(weekAttendance * 100).toFixed(0)}% < 100%`);
		}
		if (weekCompletionRate < qw.minCompletionRate) {
			reasons.push(`Completion ${(weekCompletionRate * 100).toFixed(0)}% < 95%`);
		}
		if (weekNoShowCount > qw.maxNoShows) {
			reasons.push(`${weekNoShowCount} no-show(s) this week`);
		}
		if (weekLateCancelCount > qw.maxLateCancellations) {
			reasons.push(`${weekLateCancelCount} late cancellation(s) this week`);
		}
	}

	const newStreak = qualified ? previousStreak + 1 : previousStreak;
	const newStars = qualified
		? Math.min(previousStars + 1, dispatchPolicy.health.maxStars)
		: previousStars;

	if (qualified) {
		reasons.push('Qualifying week — streak advanced');
	} else {
		reasons.push('Non-qualifying week — streak unchanged');
	}

	return {
		userId,
		weekStart: weekStartStr,
		qualified,
		hardStopReset: false,
		neutral: false,
		previousStars,
		newStars,
		previousStreak,
		newStreak,
		reasons
	};
}

/**
 * Persist weekly evaluation result and send notifications.
 */
async function persistWeeklyEval(result: WeeklyEvalResult): Promise<void> {
	if (result.neutral) {
		return;
	}

	const now = new Date();

	const weeklyUpsert: Record<string, unknown> = {
		streakWeeks: result.newStreak,
		stars: result.newStars,
		nextMilestoneStars: Math.min(result.newStars + 1, dispatchPolicy.health.maxStars),
		updatedAt: now
	};
	if (result.qualified) {
		weeklyUpsert.lastQualifiedWeekStart = result.weekStart;
	}
	if (result.hardStopReset) {
		const [currentState] = await db
			.select({ reinstatedAt: driverHealthState.reinstatedAt })
			.from(driverHealthState)
			.where(eq(driverHealthState.userId, result.userId));

		let shouldDisablePool = true;

		if (currentState?.reinstatedAt) {
			const newEvents = await hasNewHardStopEvents(result.userId, currentState.reinstatedAt);
			if (!newEvents) {
				shouldDisablePool = false;
			} else {
				weeklyUpsert.reinstatedAt = null;
			}
		}

		if (shouldDisablePool) {
			weeklyUpsert.assignmentPoolEligible = false;
			weeklyUpsert.requiresManagerIntervention = true;
		}
	}

	await db
		.insert(driverHealthState)
		.values({
			userId: result.userId,
			streakWeeks: result.newStreak,
			stars: result.newStars,
			lastQualifiedWeekStart: result.qualified ? result.weekStart : null,
			nextMilestoneStars: Math.min(result.newStars + 1, dispatchPolicy.health.maxStars),
			assignmentPoolEligible: !result.hardStopReset,
			requiresManagerIntervention: result.hardStopReset,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: driverHealthState.userId,
			set: weeklyUpsert
		});

	// Send notifications
	if (result.hardStopReset && result.previousStars > 0) {
		await sendNotification(result.userId, 'streak_reset', {
			customBody: `Your streak has been reset to 0 stars. ${result.reasons[0]}`
		});
	} else if (result.qualified && result.newStars > result.previousStars) {
		await sendNotification(result.userId, 'streak_advanced', {
			customBody: `Great work! You earned star ${result.newStars} of ${dispatchPolicy.health.maxStars}.`
		});

		if (result.newStars === dispatchPolicy.health.maxStars) {
			await sendNotification(result.userId, 'bonus_eligible', {
				customBody: `Congratulations! You reached ${dispatchPolicy.health.maxStars} stars and qualify for a +${dispatchPolicy.health.simulationBonus.fourStarBonusPercent}% bonus preview.`
			});
		}
	}

	await createAuditLog({
		entityType: 'driver_health',
		entityId: result.userId,
		action: result.hardStopReset
			? 'streak_reset'
			: result.qualified
				? 'streak_advanced'
				: 'week_evaluated',
		actorType: 'system',
		actorId: null,
		changes: {
			weekStart: result.weekStart,
			qualified: result.qualified,
			hardStopReset: result.hardStopReset,
			previousStars: result.previousStars,
			newStars: result.newStars,
			previousStreak: result.previousStreak,
			newStreak: result.newStreak,
			reasons: result.reasons
		}
	});
}

// ---------------------------------------------------------------------------
// Batch runners (for cron jobs)
// ---------------------------------------------------------------------------

export interface DailyHealthRunResult {
	evaluated: number;
	scored: number;
	skippedNewDrivers: number;
	correctiveWarnings: number;
	errors: number;
	elapsedMs: number;
}

/**
 * Run daily health evaluation for all active drivers.
 * Computes score, persists snapshot, and sends corrective warnings.
 */
export async function runDailyHealthEvaluation(): Promise<DailyHealthRunResult> {
	const log = logger.child({ operation: 'runDailyHealthEvaluation' });
	const start = Date.now();
	const today = torontoToday();

	const drivers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'driver'));

	let scored = 0;
	let skippedNewDrivers = 0;
	let correctiveWarnings = 0;
	let errors = 0;

	const batchSize = dispatchPolicy.jobs.performanceCheckBatchSize;
	for (let i = 0; i < drivers.length; i += batchSize) {
		const batch = drivers.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (driver) => {
				try {
					let dailyResult = await computeDailyScore(driver.id);

					if (!dailyResult) {
						skippedNewDrivers++;
						return;
					}

					try {
						await persistDailyScore(dailyResult, today);
					} catch (error) {
						if (!(error instanceof Error) || error.message !== 'STALE_DAILY_HEALTH_WRITE') {
							throw error;
						}

						log.warn(
							{ userId: driver.id },
							'Retrying daily health evaluation after stale-write guard'
						);

						dailyResult = await computeDailyScore(driver.id);

						if (!dailyResult) {
							skippedNewDrivers++;
							return;
						}

						await persistDailyScore(dailyResult, today);
					}

					scored++;

					const completionRate = dailyResult.completionRate;

					if (completionRate < dispatchPolicy.health.correctiveCompletionThreshold) {
						const recoveryCutoff = subDays(
							new Date(),
							dispatchPolicy.health.correctiveRecoveryDays
						);
						const [recentWarning] = await db
							.select({ id: notifications.id })
							.from(notifications)
							.where(
								and(
									eq(notifications.userId, driver.id),
									eq(notifications.type, 'corrective_warning'),
									gte(notifications.createdAt, recoveryCutoff)
								)
							)
							.limit(1);

						if (!recentWarning) {
							await sendNotification(driver.id, 'corrective_warning');
							correctiveWarnings++;
						}
					}
				} catch (error) {
					errors++;
					log.error({ userId: driver.id, error }, 'Failed to evaluate driver health');
				}
			})
		);
	}

	const elapsedMs = Date.now() - start;
	log.info(
		{ evaluated: drivers.length, scored, skippedNewDrivers, correctiveWarnings, errors, elapsedMs },
		'Daily health evaluation completed'
	);

	return {
		evaluated: drivers.length,
		scored,
		skippedNewDrivers,
		correctiveWarnings,
		errors,
		elapsedMs
	};
}

export interface WeeklyHealthRunResult {
	evaluated: number;
	qualified: number;
	hardStopResets: number;
	neutral: number;
	errors: number;
	elapsedMs: number;
}

/**
 * Run weekly health evaluation for all active drivers.
 * Evaluates the just-completed week (Monday to Sunday).
 *
 * Should be called early Monday after the week closes.
 */
export async function runWeeklyHealthEvaluation(): Promise<WeeklyHealthRunResult> {
	const log = logger.child({ operation: 'runWeeklyHealthEvaluation' });
	const start = Date.now();

	const nowToronto = toZonedTime(new Date(), TORONTO_TZ);
	const thisMonday = startOfWeek(nowToronto, { weekStartsOn: 1 });
	const lastMonday = subDays(thisMonday, 7);

	log.info(
		{
			weekStart: format(lastMonday, 'yyyy-MM-dd'),
			weekEnd: format(subDays(thisMonday, 1), 'yyyy-MM-dd')
		},
		'Evaluating week'
	);

	const drivers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'driver'));

	let qualified = 0;
	let hardStopResets = 0;
	let neutral = 0;
	let errors = 0;

	const batchSize = dispatchPolicy.jobs.performanceCheckBatchSize;
	for (let i = 0; i < drivers.length; i += batchSize) {
		const batch = drivers.slice(i, i + batchSize);
		await Promise.all(
			batch.map(async (driver) => {
				try {
					const result = await evaluateWeek(driver.id, lastMonday);
					await persistWeeklyEval(result);

					if (result.neutral) neutral++;
					else if (result.hardStopReset) hardStopResets++;
					else if (result.qualified) qualified++;
				} catch (error) {
					errors++;
					log.error({ userId: driver.id, error }, 'Failed to evaluate weekly health');
				}
			})
		);
	}

	const elapsedMs = Date.now() - start;
	log.info(
		{ evaluated: drivers.length, qualified, hardStopResets, neutral, errors, elapsedMs },
		'Weekly health evaluation completed'
	);

	return {
		evaluated: drivers.length,
		qualified,
		hardStopResets,
		neutral,
		errors,
		elapsedMs
	};
}
