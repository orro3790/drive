/**
 * Driver Health Service
 *
 * Daily 0-100 scoring and weekly 0-4 star progression with hard-stop resets.
 * See docs/plans/driver-health-gamification.md for full specification.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	bidWindows,
	driverHealthSnapshots,
	driverHealthState,
	driverMetrics,
	notifications,
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

const TORONTO_TZ = dispatchPolicy.timezone.toronto;

function torontoToday(): string {
	return format(toZonedTime(new Date(), TORONTO_TZ), 'yyyy-MM-dd');
}

// ---------------------------------------------------------------------------
// Rolling-window event counts
// ---------------------------------------------------------------------------

interface RollingCounts {
	noShowCount30d: number;
	lateCancellationCount30d: number;
}

/**
 * Count no-shows and late cancellations for a driver in the last N days.
 *
 * - No-shows: bid windows with trigger='no_show' for this user's assignments
 *   where the assignment date falls within the window.
 * - Late cancellations: cancelled assignments that were confirmed, with
 *   assignment date in the window. Late cancellations are by definition <=48h
 *   before the shift, so the assignment date is a reliable proxy.
 */
async function getRollingCounts(userId: string, windowDays: number): Promise<RollingCounts> {
	const nowToronto = toZonedTime(new Date(), TORONTO_TZ);
	const cutoffDate = format(subDays(nowToronto, windowDays), 'yyyy-MM-dd');
	const todayStr = format(nowToronto, 'yyyy-MM-dd');

	// No-shows: assignments for this driver that triggered no-show bid windows
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

	// Late cancellations: confirmed assignments that were cancelled, date in window
	const [lateCancelResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				eq(assignments.status, 'cancelled'),
				isNotNull(assignments.confirmedAt),
				gte(assignments.date, cutoffDate),
				lte(assignments.date, todayStr)
			)
		);

	return {
		noShowCount30d: noShowResult?.count ?? 0,
		lateCancellationCount30d: lateCancelResult?.count ?? 0
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
	noShowCount30d: number;
	lateCancellationCount30d: number;
	hardStopTriggered: boolean;
	reasons: string[];
}

/**
 * Compute the daily health score for a single driver.
 *
 * Score = attendance(50) + completion(30) + reliability(20)
 * Hard-stop: any no-show OR >=2 late cancellations in rolling 30 days caps
 * score at 49.
 */
export async function computeDailyScore(userId: string): Promise<DailyScoreResult | null> {
	const [metrics] = await db
		.select({
			totalShifts: driverMetrics.totalShifts,
			completedShifts: driverMetrics.completedShifts,
			attendanceRate: driverMetrics.attendanceRate,
			completionRate: driverMetrics.completionRate
		})
		.from(driverMetrics)
		.where(eq(driverMetrics.userId, userId));

	if (!metrics || metrics.totalShifts === 0) {
		// New driver with no shifts — neutral state, no score
		return null;
	}

	const { attendanceRate, completionRate } = metrics;
	const rolling = await getRollingCounts(userId, dispatchPolicy.health.lateCancelRollingDays);
	const reasons: string[] = [];

	// Base score components (each rate is 0-1, scaled to weight)
	const weights = dispatchPolicy.health.scoreWeights;
	const attendanceComponent = attendanceRate * weights.attendance;
	const completionComponent = completionRate * weights.completion;

	// Reliability component: inverse of penalty events in rolling window
	// 0 events = full 20 points, each event deducts proportionally
	const totalEvents = rolling.noShowCount30d + rolling.lateCancellationCount30d;
	const reliabilityComponent = Math.max(0, weights.reliability - totalEvents * 5);

	let baseScore = Math.round(attendanceComponent + completionComponent + reliabilityComponent);
	baseScore = Math.max(0, Math.min(100, baseScore));

	// Hard-stop check
	const hardStopTriggered =
		rolling.noShowCount30d > 0 ||
		rolling.lateCancellationCount30d >= dispatchPolicy.health.lateCancelThreshold;

	if (hardStopTriggered) {
		baseScore = Math.min(baseScore, dispatchPolicy.health.hardStopScoreCap);
		if (rolling.noShowCount30d > 0) {
			reasons.push(`No-show in last ${dispatchPolicy.health.lateCancelRollingDays} days`);
		}
		if (rolling.lateCancellationCount30d >= dispatchPolicy.health.lateCancelThreshold) {
			reasons.push(
				`${rolling.lateCancellationCount30d} late cancellations in last ${dispatchPolicy.health.lateCancelRollingDays} days`
			);
		}
	}

	// Corrective state: completion below threshold
	if (completionRate < dispatchPolicy.health.correctiveCompletionThreshold) {
		reasons.push(
			`Completion rate ${(completionRate * 100).toFixed(0)}% below ${dispatchPolicy.health.correctiveCompletionThreshold * 100}% threshold`
		);
	}

	return {
		userId,
		score: baseScore,
		attendanceRate,
		completionRate,
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
	// Upsert snapshot
	await db
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
			reasons: result.reasons
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
				reasons: result.reasons
			}
		});

	// Update current state (score only).
	// Pool eligibility is a one-way latch: hard-stop removes from pool, but only
	// a manager action can reinstate. We never set assignmentPoolEligible=true here.
	const upsertBase: Record<string, unknown> = {
		currentScore: result.score,
		updatedAt: new Date()
	};

	if (result.hardStopTriggered) {
		Object.assign(upsertBase, {
			assignmentPoolEligible: false,
			requiresManagerIntervention: true
		});
	}

	await db
		.insert(driverHealthState)
		.values({
			userId: result.userId,
			currentScore: result.score,
			assignmentPoolEligible: !result.hardStopTriggered,
			requiresManagerIntervention: result.hardStopTriggered,
			updatedAt: new Date()
		})
		.onConflictDoUpdate({
			target: driverHealthState.userId,
			set: upsertBase
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

	// Attendance: all non-cancelled assignments must be completed
	const nonCancelledCount = totalAssignments - cancelledAssignments.length;
	const weekAttendance = nonCancelledCount > 0 ? completedAssignments.length / nonCancelledCount : 0;

	// Week-specific completion rate (not all-time from driverMetrics).
	// The daily score uses all-time rates; weekly qualification uses this-week-only.
	const weekShifts = await db
		.select({
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered
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

	const weekCompletionRate =
		weekShifts.length > 0
			? weekShifts.reduce(
					(sum, s) => sum + (s.parcelsDelivered ?? 0) / (s.parcelsStart ?? 1),
					0
				) / weekShifts.length
			: 0;

	// No-shows this week (subset of rolling — check assignments in this week specifically)
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

	// Late cancellations this week
	const weekLateCancels = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				eq(assignments.status, 'cancelled'),
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

	// Streak counts cumulative qualifying weeks (not consecutive).
	// Non-qualifying weeks (without hard-stop) leave streak unchanged.
	// Only hard-stop events reset streak to 0 (handled above).
	const newStreak = qualified
		? previousStreak + 1
		: previousStreak;
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
		return; // No state change for zero-assignment weeks
	}

	const now = new Date();

	// Build upsert set — pool eligibility is a one-way latch (same as daily).
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
		weeklyUpsert.assignmentPoolEligible = false;
		weeklyUpsert.requiresManagerIntervention = true;
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

		// Bonus eligibility at max stars
		if (result.newStars === dispatchPolicy.health.maxStars) {
			await sendNotification(result.userId, 'bonus_eligible', {
				customBody: `Congratulations! You reached ${dispatchPolicy.health.maxStars} stars and qualify for a +${dispatchPolicy.health.simulationBonus.fourStarBonusPercent}% bonus preview.`
			});
		}
	}

	// Audit log for state transitions
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

	// Get all active drivers
	const drivers = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.role, 'driver'));

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
					const result = await computeDailyScore(driver.id);

					if (!result) {
						skippedNewDrivers++;
						return;
					}

					await persistDailyScore(result, today);
					scored++;

					// Send corrective warning if completion below threshold,
				// but only if no corrective_warning was sent in the recovery window
				if (
					result.completionRate <
					dispatchPolicy.health.correctiveCompletionThreshold
				) {
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

	// The week that just ended: previous Monday
	const nowToronto = toZonedTime(new Date(), TORONTO_TZ);
	const thisMonday = startOfWeek(nowToronto, { weekStartsOn: 1 });
	const lastMonday = subDays(thisMonday, 7);

	log.info(
		{ weekStart: format(lastMonday, 'yyyy-MM-dd'), weekEnd: format(subDays(thisMonday, 1), 'yyyy-MM-dd') },
		'Evaluating week'
	);

	const drivers = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.role, 'driver'));

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
