/**
 * Assignments and Shifts Generator
 *
 * Creates assignments with realistic status distribution based on timeline:
 * - Past dates: 85% completed, 10% cancelled, 5% unfilled
 * - Today: In progress or completed (morning) / scheduled (afternoon)
 * - Future: scheduled or unfilled
 *
 * Also generates shift records for active/completed/cancelled assignments.
 */

import type { SeedConfig } from '../config';
import type { GeneratedUser } from './users';
import type { GeneratedPreference } from './preferences';
import {
	getWeekRange,
	getWeekDates,
	isPastDate,
	isFutureDate,
	isToday,
	randomTimeOnDate,
	toTorontoDateString,
	getTorontoToday
} from '../utils/dates';
import { getSeedNow, random, randomInt } from '../utils/runtime';

export interface GeneratedAssignment {
	routeId: string;
	userId: string | null;
	warehouseId: string;
	date: string;
	status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled';
	assignedBy: 'algorithm' | 'manager' | 'bid' | null;
	assignedAt: Date | null;
	confirmedAt: Date | null;
	cancelType: 'driver' | 'late' | 'auto_drop' | null;
}

export interface GeneratedShift {
	assignmentIndex: number; // Index into assignments array for linking
	arrivedAt: Date | null;
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	startedAt: Date | null;
	completedAt: Date | null;
	cancelledAt: Date | null;
	cancelReason: string | null;
	cancelNotes: string | null;
}

export interface GeneratedAssignmentsResult {
	assignments: GeneratedAssignment[];
	shifts: GeneratedShift[];
}

const CANCEL_REASONS = [
	'vehicle_breakdown',
	'medical_emergency',
	'family_emergency',
	'traffic_accident',
	'weather_conditions',
	'personal_emergency',
	'other'
] as const;

/**
 * Generate assignments and shifts for all weeks in the configured range.
 */
export function generateAssignments(
	config: SeedConfig,
	drivers: GeneratedUser[],
	preferences: GeneratedPreference[],
	routeIds: string[],
	warehouseIdByRoute: Map<string, string>
): GeneratedAssignmentsResult {
	const assignments: GeneratedAssignment[] = [];
	const shifts: GeneratedShift[] = [];

	const weeks = getWeekRange(config.pastWeeks, config.futureWeeks);

	// Build preference lookup
	const prefByUser = new Map(preferences.map((p) => [p.userId, p]));

	// Track weekly assignment count per driver
	const weeklyCount = new Map<string, Map<string, number>>(); // weekKey -> userId -> count
	// Track daily assignments to enforce 1 route per driver per day
	const dailyAssigned = new Map<string, Set<string>>(); // dateString -> Set<userId>

	for (const weekStart of weeks) {
		const weekKey = toTorontoDateString(weekStart);
		weeklyCount.set(weekKey, new Map());

		const dates = getWeekDates(weekStart);

		for (const { dateString, dayOfWeek } of dates) {
			if (!dailyAssigned.has(dateString)) {
				dailyAssigned.set(dateString, new Set());
			}

			// For each route, create an assignment
			for (const routeId of routeIds) {
				const warehouseId = warehouseIdByRoute.get(routeId)!;

				// Find eligible driver for this route/day
				const eligibleDriverId = findEligibleDriver(
					drivers,
					prefByUser,
					routeId,
					dayOfWeek,
					weekKey,
					weeklyCount,
					dailyAssigned.get(dateString)!
				);

				// Determine status based on date
				const status = determineStatus(dateString, eligibleDriverId);
				const assignedBy = eligibleDriverId ? 'algorithm' : null;
				const confirmedAt = generateConfirmedAt(dateString, status);

				const cancelType = determineCancelType(status, confirmedAt);

				const assignment: GeneratedAssignment = {
					routeId,
					userId: eligibleDriverId,
					warehouseId,
					date: dateString,
					status,
					assignedBy,
					assignedAt: eligibleDriverId ? getSeedNow() : null,
					confirmedAt,
					cancelType
				};

				const assignmentIndex = assignments.length;
				assignments.push(assignment);

				// Update weekly count and daily set if driver assigned
				if (eligibleDriverId) {
					const weekCounts = weeklyCount.get(weekKey)!;
					weekCounts.set(eligibleDriverId, (weekCounts.get(eligibleDriverId) || 0) + 1);
					dailyAssigned.get(dateString)!.add(eligibleDriverId);
				}

				// Create shift record for completed/cancelled/active assignments
				if (status === 'completed' || status === 'cancelled' || status === 'active') {
					const shift = createShiftForStatus(assignmentIndex, dateString, status);
					shifts.push(shift);
				}
			}
		}
	}

	return { assignments, shifts };
}

function findEligibleDriver(
	drivers: GeneratedUser[],
	prefByUser: Map<string, GeneratedPreference>,
	routeId: string,
	dayOfWeek: number,
	weekKey: string,
	weeklyCount: Map<string, Map<string, number>>,
	dailyAssignedForDate: Set<string>
): string | null {
	const eligibleDrivers = drivers.filter((d) => {
		if (d.role !== 'driver') return false;
		if (d.isFlagged) return false;

		const pref = prefByUser.get(d.id);
		if (!pref) return false;

		// Check day preference
		if (!pref.preferredDays.includes(dayOfWeek)) return false;

		// Check route preference
		if (!pref.preferredRoutes.includes(routeId)) return false;

		// Enforce 1 route per driver per day
		if (dailyAssignedForDate.has(d.id)) return false;

		// Check weekly cap
		const weekCounts = weeklyCount.get(weekKey)!;
		const currentCount = weekCounts.get(d.id) || 0;
		if (currentCount >= d.weeklyCap) return false;

		return true;
	});

	if (eligibleDrivers.length === 0) return null;

	// Randomly select from eligible (in real scheduling, this uses scoring)
	return eligibleDrivers[randomInt(0, eligibleDrivers.length)].id;
}

function determineStatus(
	dateString: string,
	hasDriver: string | null
): 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled' {
	if (!hasDriver) return 'unfilled';

	if (isPastDate(dateString)) {
		// Past: 85% completed, 10% cancelled, 5% unfilled
		const roll = random();
		if (roll < 0.85) return 'completed';
		if (roll < 0.95) return 'cancelled';
		return 'unfilled';
	}

	if (isToday(dateString)) {
		// Today: 50% active, 30% completed (morning shifts done), 20% scheduled (afternoon)
		const roll = random();
		if (roll < 0.5) return 'active';
		if (roll < 0.8) return 'completed';
		return 'scheduled';
	}

	// Future: always scheduled
	return 'scheduled';
}

function createShiftForStatus(
	assignmentIndex: number,
	dateString: string,
	status: 'completed' | 'cancelled' | 'active'
): GeneratedShift {
	const parcelsStart = 100 + randomInt(0, 100); // 100-200

	if (status === 'completed') {
		const deliveryRate = 0.9 + random() * 0.1; // 90-100%
		const parcelsDelivered = Math.floor(parcelsStart * deliveryRate);
		const parcelsReturned = parcelsStart - parcelsDelivered;

		return {
			assignmentIndex,
			arrivedAt: randomTimeOnDate(dateString, 6, 8),
			parcelsStart,
			parcelsDelivered,
			parcelsReturned,
			startedAt: randomTimeOnDate(dateString, 6, 10),
			completedAt: randomTimeOnDate(dateString, 14, 20),
			cancelledAt: null,
			cancelReason: null,
			cancelNotes: null
		};
	}

	if (status === 'cancelled') {
		const cancelReason = CANCEL_REASONS[randomInt(0, CANCEL_REASONS.length)];

		return {
			assignmentIndex,
			arrivedAt: null,
			parcelsStart: null,
			parcelsDelivered: null,
			parcelsReturned: null,
			startedAt: null,
			completedAt: null,
			cancelledAt: randomTimeOnDate(dateString, 5, 12),
			cancelReason,
			cancelNotes: cancelReason === 'other' ? 'Unexpected circumstances' : null
		};
	}

	// Active - shift started but not completed
	return {
		assignmentIndex,
		arrivedAt: randomTimeOnDate(toTorontoDateString(getTorontoToday()), 6, 8),
		parcelsStart,
		parcelsDelivered: null,
		parcelsReturned: null,
		startedAt: randomTimeOnDate(toTorontoDateString(getTorontoToday()), 6, 10),
		completedAt: null,
		cancelledAt: null,
		cancelReason: null,
		cancelNotes: null
	};
}

/**
 * Determine cancelType for cancelled assignments.
 * - late: confirmed then cancelled (late cancellation)
 * - auto_drop: ~20% of unconfirmed cancellations
 * - driver: regular driver-initiated cancellation
 */
function determineCancelType(
	status: string,
	confirmedAt: Date | null
): 'driver' | 'late' | 'auto_drop' | null {
	if (status !== 'cancelled') return null;

	if (confirmedAt !== null) {
		return 'late';
	}

	// 20% of unconfirmed cancellations are auto-drops
	if (random() < 0.2) {
		return 'auto_drop';
	}

	return 'driver';
}

/**
 * Generate confirmedAt timestamp based on assignment status.
 * - completed/active: always confirmed (3-5 days before assignment date)
 * - cancelled: 30% confirmed (late cancellations), 70% null (pre-confirmation drops)
 * - scheduled (future): 60% confirmed, 40% null (haven't confirmed yet)
 * - unfilled: null
 */
function generateConfirmedAt(
	dateString: string,
	status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled'
): Date | null {
	if (status === 'unfilled') return null;

	if (status === 'completed' || status === 'active') {
		// Always confirmed — 3-5 days before assignment date
		const daysBeforeShift = 3 + randomInt(0, 3); // 3, 4, or 5
		const assignmentDate = new Date(`${dateString}T12:00:00`);
		assignmentDate.setDate(assignmentDate.getDate() - daysBeforeShift);
		return randomTimeOnDate(toTorontoDateString(assignmentDate), 8, 22);
	}

	if (status === 'cancelled') {
		// 30% are late cancellations (confirmed then cancelled)
		if (random() < 0.3) {
			const daysBeforeShift = 3 + randomInt(0, 3);
			const assignmentDate = new Date(`${dateString}T12:00:00`);
			assignmentDate.setDate(assignmentDate.getDate() - daysBeforeShift);
			return randomTimeOnDate(toTorontoDateString(assignmentDate), 8, 22);
		}
		return null;
	}

	// Future scheduled: 60% confirmed, 40% not yet
	if (isFutureDate(dateString)) {
		if (random() < 0.6) {
			const daysBeforeShift = 3 + randomInt(0, 3);
			const assignmentDate = new Date(`${dateString}T12:00:00`);
			assignmentDate.setDate(assignmentDate.getDate() - daysBeforeShift);
			return randomTimeOnDate(toTorontoDateString(assignmentDate), 8, 22);
		}
		return null;
	}

	return null;
}
