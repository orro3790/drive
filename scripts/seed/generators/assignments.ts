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
}

export interface GeneratedShift {
	assignmentIndex: number; // Index into assignments array for linking
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

	for (const weekStart of weeks) {
		const weekKey = toTorontoDateString(weekStart);
		weeklyCount.set(weekKey, new Map());

		const dates = getWeekDates(weekStart);

		for (const { dateString, dayOfWeek } of dates) {
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
					weeklyCount
				);

				// Determine status based on date
				const status = determineStatus(dateString, eligibleDriverId);
				const assignedBy = eligibleDriverId ? 'algorithm' : null;

				const assignment: GeneratedAssignment = {
					routeId,
					userId: eligibleDriverId,
					warehouseId,
					date: dateString,
					status,
					assignedBy,
					assignedAt: eligibleDriverId ? getSeedNow() : null
				};

				const assignmentIndex = assignments.length;
				assignments.push(assignment);

				// Update weekly count if driver assigned
				if (eligibleDriverId) {
					const weekCounts = weeklyCount.get(weekKey)!;
					weekCounts.set(eligibleDriverId, (weekCounts.get(eligibleDriverId) || 0) + 1);
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
	weeklyCount: Map<string, Map<string, number>>
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
