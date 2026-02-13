/**
 * Health Seed Generator
 *
 * Produces driverHealthSnapshots (daily scores) and driverHealthState (current state)
 * derived from actual assignment/shift/metrics data using the additive point system.
 *
 * With persona-driven assignment data:
 * - Exemplary drivers (100% completion, 4 weeks) reach 4 stars organically
 * - Unreliable drivers with no-shows trigger hard-stop
 * - Good drivers get realistic mid-range scores
 */

import type { GeneratedUser } from './users';
import type { GeneratedAssignment, GeneratedShift } from './assignments';
import type { GeneratedMetric } from './metrics';
import type { HealthContributions } from '../../../src/lib/schemas/health';
import { dispatchPolicy } from '../../../src/lib/config/dispatchPolicy';
import { isPastDate, isToday, getWeekStart, toTorontoDateString } from '../utils/dates';
import { addDays, subDays } from 'date-fns';

export interface GeneratedHealthSnapshot {
	userId: string;
	evaluatedAt: string; // YYYY-MM-DD
	score: number;
	attendanceRate: number;
	completionRate: number;
	lateCancellationCount30d: number;
	noShowCount30d: number;
	hardStopTriggered: boolean;
	reasons: string[];
	contributions: HealthContributions | null;
}

export interface GeneratedHealthState {
	userId: string;
	currentScore: number;
	streakWeeks: number;
	stars: number;
	lastQualifiedWeekStart: string | null;
	assignmentPoolEligible: boolean;
	requiresManagerIntervention: boolean;
	nextMilestoneStars: number;
	lastScoreResetAt: Date | null;
}

export interface GeneratedHealthResult {
	snapshots: GeneratedHealthSnapshot[];
	states: GeneratedHealthState[];
}

/**
 * Detect no-show: past + scheduled + confirmed + no shift arrival.
 * This is the state before the no-show detection cron cancels them.
 */
function isNoShow(
	assignment: GeneratedAssignment,
	shift: GeneratedShift | undefined
): boolean {
	return (
		isPastDate(assignment.date) &&
		assignment.status === 'scheduled' &&
		assignment.confirmedAt !== null &&
		(!shift || !shift.arrivedAt)
	);
}

/**
 * Generate health snapshots and state for all drivers with past assignments.
 */
export function generateHealth(
	drivers: GeneratedUser[],
	assignments: GeneratedAssignment[],
	shifts: GeneratedShift[],
	metrics: GeneratedMetric[]
): GeneratedHealthResult {
	const { health } = dispatchPolicy;
	const pts = health.points;
	const snapshots: GeneratedHealthSnapshot[] = [];
	const states: GeneratedHealthState[] = [];

	// Build lookup structures
	const shiftByAssignmentIndex = new Map<number, GeneratedShift>();
	for (const shift of shifts) {
		shiftByAssignmentIndex.set(shift.assignmentIndex, shift);
	}

	const metricsMap = new Map<string, GeneratedMetric>();
	for (const m of metrics) {
		metricsMap.set(m.userId, m);
	}

	// Group assignment indices by user
	const assignmentsByUser = new Map<string, { assignment: GeneratedAssignment; index: number }[]>();
	for (let i = 0; i < assignments.length; i++) {
		const a = assignments[i];
		if (!a.userId) continue;
		if (!assignmentsByUser.has(a.userId)) {
			assignmentsByUser.set(a.userId, []);
		}
		assignmentsByUser.get(a.userId)!.push({ assignment: a, index: i });
	}

	for (const driver of drivers) {
		if (driver.role !== 'driver') continue;

		const driverAssignments = assignmentsByUser.get(driver.id) ?? [];
		const driverMetric = metricsMap.get(driver.id);

		// Get unique past dates where this driver had assignments
		const pastDates = new Set<string>();
		for (const { assignment } of driverAssignments) {
			if (isPastDate(assignment.date) || isToday(assignment.date)) {
				pastDates.add(assignment.date);
			}
		}

		if (pastDates.size === 0) continue; // New driver — onboarding state

		// Sort dates chronologically
		const sortedDates = [...pastDates].sort();

		// Compute cumulative additive score for each snapshot date.
		for (const dateString of sortedDates) {
			// Count events up to this date
			const upToDate = driverAssignments.filter(
				(d) =>
					(isPastDate(d.assignment.date) || isToday(d.assignment.date)) &&
					d.assignment.date <= dateString
			);

			let confirmed = 0;
			let arrivedOnTime = 0;
			let completed = 0;
			let highDelivery = 0;
			let bidPickups = 0;
			let autoDrops = 0;
			let earlyCancels = 0;
			let lateCancels = 0;
			let noShows = 0;

			for (const { assignment, index } of upToDate) {
				const shift = shiftByAssignmentIndex.get(index);

				// No-show detection
				if (isNoShow(assignment, shift)) {
					noShows++;
					continue; // Don't count as confirmed/arrived/completed
				}

				// Confirmed on time
				if (
					assignment.confirmedAt !== null &&
					(assignment.status === 'scheduled' ||
						assignment.status === 'active' ||
						assignment.status === 'completed')
				) {
					confirmed++;
				}

				// Arrived on time
				if (shift?.arrivedAt) {
					const hours = shift.arrivedAt.getHours();
					if (hours < 9) {
						arrivedOnTime++;
					}
				}

				// Completed
				if (shift?.completedAt) {
					completed++;
				}

				// High delivery
				if (
					shift?.completedAt &&
					shift.parcelsStart &&
					shift.parcelsStart > 0 &&
					shift.parcelsDelivered &&
					shift.parcelsDelivered / shift.parcelsStart >= 0.95
				) {
					highDelivery++;
				}

				// Bid pickups
				if (assignment.assignedBy === 'bid' && assignment.status === 'completed') {
					bidPickups++;
				}

				// Auto-drops
				if (assignment.cancelType === 'auto_drop') {
					autoDrops++;
				}

				// Early cancellations (driver-initiated, not late)
				if (assignment.cancelType === 'driver') {
					earlyCancels++;
				}

				// Late cancellations
				if (assignment.cancelType === 'late') {
					lateCancels++;
				}
			}

			const contributions: HealthContributions = {
				confirmedOnTime: { count: confirmed, points: confirmed * pts.confirmedOnTime },
				arrivedOnTime: { count: arrivedOnTime, points: arrivedOnTime * pts.arrivedOnTime },
				completedShifts: { count: completed, points: completed * pts.completedShift },
				highDelivery: { count: highDelivery, points: highDelivery * pts.highDelivery },
				bidPickups: { count: bidPickups, points: bidPickups * pts.bidPickup },
				urgentPickups: { count: 0, points: 0 },
				autoDrops: { count: autoDrops, points: autoDrops * pts.autoDrop },
				earlyCancellations: { count: earlyCancels, points: earlyCancels * pts.earlyCancel },
				lateCancellations: { count: lateCancels, points: lateCancels * pts.lateCancel }
			};

			const rawTotal = Object.values(contributions).reduce((sum, line) => sum + line.points, 0);
			const score = Math.max(0, rawTotal);

			// Hard-stop check (rolling 30-day window)
			const windowStart = toTorontoDateString(
				subDays(new Date(`${dateString}T12:00:00`), health.lateCancelRollingDays)
			);
			let lateCancelCount30d = 0;
			let noShowCount30d = 0;
			for (const { assignment, index: aIdx } of driverAssignments) {
				if (assignment.date >= windowStart && assignment.date <= dateString) {
					if (assignment.cancelType === 'late') {
						lateCancelCount30d++;
					}
					if (isNoShow(assignment, shiftByAssignmentIndex.get(aIdx))) {
						noShowCount30d++;
					}
				}
			}
			const hardStopTriggered =
				noShowCount30d > 0 || lateCancelCount30d >= health.lateCancelThreshold;

			const reasons: string[] = [];
			if (noShowCount30d > 0) {
				reasons.push(`${noShowCount30d} no-show(s) in last 30 days`);
			}
			if (lateCancelCount30d >= health.lateCancelThreshold) {
				reasons.push(`${lateCancelCount30d} late cancellation(s) in last 30 days`);
			}

			snapshots.push({
				userId: driver.id,
				evaluatedAt: dateString,
				score,
				attendanceRate: driverMetric?.attendanceRate ?? 0,
				completionRate: driverMetric?.completionRate ?? 0,
				lateCancellationCount30d: lateCancelCount30d,
				noShowCount30d,
				hardStopTriggered,
				reasons,
				contributions
			});
		}

		// Weekly star evaluation
		const allWeekStarts = new Set<string>();
		for (const dateString of sortedDates) {
			const weekStart = getWeekStart(new Date(`${dateString}T12:00:00`));
			const weekStartStr = toTorontoDateString(weekStart);
			const weekEnd = toTorontoDateString(addDays(weekStart, 6));
			if (isPastDate(weekEnd)) {
				allWeekStarts.add(weekStartStr);
			}
		}

		const sortedWeekStarts = [...allWeekStarts].sort();
		let streakWeeks = 0;
		let stars = 0;
		let lastQualifiedWeekStart: string | null = null;
		let anyHardStop = false;

		for (const weekStartStr of sortedWeekStarts) {
			const weekEndStr = toTorontoDateString(addDays(new Date(`${weekStartStr}T12:00:00`), 6));

			const weekAssignments = driverAssignments.filter(
				(d) => d.assignment.date >= weekStartStr && d.assignment.date <= weekEndStr
			);

			if (weekAssignments.length === 0) continue;

			// Hard-stop check for this week
			const hardStopWindowStart = toTorontoDateString(
				subDays(new Date(`${weekEndStr}T12:00:00`), health.lateCancelRollingDays)
			);
			let weekLateCancels = 0;
			let weekNoShows = 0;
			for (const { assignment, index: aIdx } of driverAssignments) {
				if (assignment.date >= hardStopWindowStart && assignment.date <= weekEndStr) {
					if (assignment.cancelType === 'late') {
						weekLateCancels++;
					}
					if (isNoShow(assignment, shiftByAssignmentIndex.get(aIdx))) {
						weekNoShows++;
					}
				}
			}
			const weekHardStop =
				weekNoShows > 0 || weekLateCancels >= health.lateCancelThreshold;

			if (weekHardStop) {
				stars = 0;
				streakWeeks = 0;
				anyHardStop = true;
				continue;
			}

			// Qualifying week criteria
			const nonCancelledAssignments = weekAssignments.filter(
				(d) => d.assignment.status !== 'cancelled' && d.assignment.status !== 'unfilled'
			);

			// Count no-shows separately — they look like 'scheduled' assignments
			let weekNoShowCount = 0;
			for (const { assignment, index: aIdx } of weekAssignments) {
				if (isNoShow(assignment, shiftByAssignmentIndex.get(aIdx))) {
					weekNoShowCount++;
				}
			}

			const completedInWeek = weekAssignments.filter(
				(d) => d.assignment.status === 'completed'
			).length;
			// For attendance: total includes non-cancelled but also no-shows count against
			const totalInWeek = nonCancelledAssignments.length;

			const weekAttendance = totalInWeek > 0 ? completedInWeek / totalInWeek : 0;

			let weekParcelsStart = 0;
			let weekParcelsDelivered = 0;
			for (const { assignment, index } of weekAssignments) {
				if (assignment.status !== 'completed') continue;
				const shift = shiftByAssignmentIndex.get(index);
				if (shift?.parcelsStart && shift?.parcelsDelivered) {
					weekParcelsStart += shift.parcelsStart;
					weekParcelsDelivered += shift.parcelsDelivered;
				}
			}
			const weekCompletion = weekParcelsStart > 0 ? weekParcelsDelivered / weekParcelsStart : 0;

			const weekLateCancellations = weekAssignments.filter(
				(d) => d.assignment.cancelType === 'late'
			).length;

			const qualifies =
				weekAttendance >= health.qualifyingWeek.minAttendanceRate &&
				weekCompletion >= health.qualifyingWeek.minCompletionRate &&
				weekNoShowCount <= health.qualifyingWeek.maxNoShows &&
				weekLateCancellations <= health.qualifyingWeek.maxLateCancellations;

			if (qualifies) {
				streakWeeks++;
				stars = Math.min(stars + 1, health.maxStars);
				lastQualifiedWeekStart = weekStartStr;
			}
		}

		// Build health state
		const latestSnapshot = snapshots
			.filter((s) => s.userId === driver.id)
			.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0];

		states.push({
			userId: driver.id,
			currentScore: anyHardStop
				? Math.min(latestSnapshot?.score ?? 0, health.tierThreshold - 1)
				: latestSnapshot?.score ?? 0,
			streakWeeks,
			stars,
			lastQualifiedWeekStart,
			assignmentPoolEligible: !anyHardStop,
			requiresManagerIntervention: anyHardStop,
			nextMilestoneStars: Math.min(stars + 1, health.maxStars),
			lastScoreResetAt: anyHardStop ? new Date() : null
		});
	}

	return { snapshots, states };
}
