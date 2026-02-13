/**
 * Assignments and Shifts Generator
 *
 * Creates assignments with realistic status distribution based on timeline:
 * - Past dates: completed or cancelled only (never active/scheduled)
 * - Today: deterministic lifecycle stages for the first 6 drivers
 * - Future: scheduled (confirmed or unconfirmed)
 *
 * Driver personas control completion rates:
 * - Exemplary: 100% completion (star progression, bonus simulation)
 * - Good: ~95% completion (normal drivers)
 * - Unreliable: ~70% completion (flagging, hard-stop testing)
 * - New: 0 past shifts (onboarding empty state)
 *
 * Also generates shift records for active/completed/cancelled assignments.
 */

import type { SeedConfig } from '../config';
import type { GeneratedUser } from './users';
import type { GeneratedPreference } from './preferences';
import { dispatchPolicy, parseRouteStartTime } from '../../../src/lib/config/dispatchPolicy';
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
	editableUntil: Date | null;
	exceptedReturns: number;
	exceptionNotes: string | null;
	cancelledAt: Date | null;
	cancelReason: string | null;
	cancelNotes: string | null;
}

export interface GeneratedAssignmentsResult {
	assignments: GeneratedAssignment[];
	shifts: GeneratedShift[];
	/** Driver persona assignments for downstream generators */
	personas: DriverPersonas;
	/** Assignment indices that represent no-shows (for bidding generator) */
	noShowIndices: number[];
}

// --- Driver Personas ---

export type PersonaType = 'exemplary' | 'good' | 'unreliable' | 'new';

export interface DriverPersonas {
	exemplary: string[]; // user IDs
	good: string[];
	unreliable: string[];
	new: string[];
	/** Look up persona for a user ID */
	getPersona(userId: string): PersonaType;
}

function partitionDriverPersonas(drivers: GeneratedUser[]): DriverPersonas {
	const activeDrivers = drivers.filter((d) => d.role === 'driver');

	// Reserve last driver as "new" (no past shifts)
	const newDrivers = activeDrivers.length >= 4 ? [activeDrivers[activeDrivers.length - 1]] : [];
	const remaining = activeDrivers.length >= 4 ? activeDrivers.slice(0, -1) : [...activeDrivers];

	// Unreliable: 1-2 drivers (indices 0-1 from remaining for deterministic ordering)
	const unreliableCount = Math.min(2, Math.max(1, Math.floor(remaining.length * 0.15)));
	const unreliable = remaining.slice(0, unreliableCount);

	// Exemplary: 2-3 drivers
	const exemplaryCount = Math.min(3, Math.max(2, Math.floor(remaining.length * 0.25)));
	const exemplary = remaining.slice(unreliableCount, unreliableCount + exemplaryCount);

	// Good: everyone else
	const good = remaining.slice(unreliableCount + exemplaryCount);

	const personaMap = new Map<string, PersonaType>();
	for (const d of exemplary) personaMap.set(d.id, 'exemplary');
	for (const d of good) personaMap.set(d.id, 'good');
	for (const d of unreliable) personaMap.set(d.id, 'unreliable');
	for (const d of newDrivers) personaMap.set(d.id, 'new');

	return {
		exemplary: exemplary.map((d) => d.id),
		good: good.map((d) => d.id),
		unreliable: unreliable.map((d) => d.id),
		new: newDrivers.map((d) => d.id),
		getPersona(userId: string): PersonaType {
			return personaMap.get(userId) ?? 'good';
		}
	};
}

// --- Today Lifecycle Stages ---

type TodayStage =
	| 'awaiting_confirm'
	| 'confirmed_arrivable'
	| 'arrived_startable'
	| 'started_completable'
	| 'completed_editable'
	| 'completed_locked';

const TODAY_STAGES: TodayStage[] = [
	'awaiting_confirm',
	'confirmed_arrivable',
	'arrived_startable',
	'started_completable',
	'completed_editable',
	'completed_locked'
];

const CANCEL_REASONS = [
	'vehicle_breakdown',
	'medical_emergency',
	'family_emergency',
	'traffic_accident',
	'weather_conditions',
	'personal_emergency',
	'other'
] as const;

const EXCEPTION_NOTES = [
	'Holiday closure',
	'Business closed permanently',
	'Customer refused delivery',
	'Address not found',
	'Building access denied'
];

/**
 * Generate assignments and shifts for all weeks in the configured range.
 */
export function generateAssignments(
	config: SeedConfig,
	drivers: GeneratedUser[],
	preferences: GeneratedPreference[],
	routeIds: string[],
	warehouseIdByRoute: Map<string, string>,
	routeStartTimeById?: Map<string, string>
): GeneratedAssignmentsResult {
	const assignments: GeneratedAssignment[] = [];
	const shiftsList: GeneratedShift[] = [];
	const personas = partitionDriverPersonas(drivers);

	const weeks = getWeekRange(config.pastWeeks, config.futureWeeks);

	// Build preference lookup
	const prefByUser = new Map(preferences.map((p) => [p.userId, p]));

	// Track weekly assignment count per driver
	const weeklyCount = new Map<string, Map<string, number>>(); // weekKey -> userId -> count
	// Track daily assignments to enforce 1 route per driver per day
	const dailyAssigned = new Map<string, Set<string>>(); // dateString -> Set<userId>

	// Track today stage assignment for deterministic lifecycle
	let todayStageIndex = 0;
	const todayDriverStages = new Map<string, TodayStage>();

	// Track future assignments per driver for confirmation guarantees
	const futureUnconfirmedByDriver = new Map<string, number>();
	const futureConfirmedByDriver = new Map<string, number>();

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

				// Find eligible driver for this route/day (skip 'new' drivers for past dates)
				const eligibleDriverId = findEligibleDriver(
					drivers,
					prefByUser,
					routeId,
					dayOfWeek,
					weekKey,
					weeklyCount,
					dailyAssigned.get(dateString)!,
					dateString,
					personas
				);

				// Determine status based on date and persona
				let status: GeneratedAssignment['status'];
				let todayStage: TodayStage | null = null;

				if (!eligibleDriverId) {
					status = 'unfilled';
				} else if (isPastDate(dateString)) {
					status = determineStatusPast(personas.getPersona(eligibleDriverId));
				} else if (isToday(dateString)) {
					// Deterministic today lifecycle: assign stages to first 6 today-assigned drivers
					if (todayStageIndex < TODAY_STAGES.length) {
						todayStage = TODAY_STAGES[todayStageIndex];
						todayStageIndex++;
						todayDriverStages.set(eligibleDriverId, todayStage);
						status = todayStageToAssignmentStatus(todayStage);
					} else {
						// Remaining today assignments: completed or active
						const roll = random();
						if (roll < 0.6) status = 'completed';
						else if (roll < 0.9) status = 'active';
						else status = 'scheduled';
					}
				} else {
					// Future: always scheduled
					status = 'scheduled';
				}

				const assignedBy = eligibleDriverId ? 'algorithm' : null;
				const confirmedAt = generateConfirmedAt(dateString, status, todayStage);

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

				// Track future assignments for confirmation guarantees
				if (eligibleDriverId && isFutureDate(dateString)) {
					if (confirmedAt) {
						futureConfirmedByDriver.set(
							eligibleDriverId,
							(futureConfirmedByDriver.get(eligibleDriverId) ?? 0) + 1
						);
					} else {
						futureUnconfirmedByDriver.set(
							eligibleDriverId,
							(futureUnconfirmedByDriver.get(eligibleDriverId) ?? 0) + 1
						);
					}
				}

				// Create shift record for completed/cancelled/active assignments
				if (status === 'completed' || status === 'cancelled' || status === 'active') {
					const routeStart = routeStartTimeById?.get(routeId) ?? null;
					const shift = createShiftForStatus(
						assignmentIndex,
						dateString,
						status,
						todayStage,
						eligibleDriverId ? personas.getPersona(eligibleDriverId) : 'good',
						routeStart
					);
					shiftsList.push(shift);
				}
			}
		}
	}

	// --- Phase 1g: Guarantee confirmable future assignments ---
	guaranteeFutureConfirmations(
		assignments,
		futureUnconfirmedByDriver,
		futureConfirmedByDriver,
		drivers,
		personas
	);

	// --- Phase 2a: Mark ~15% of past completed assignments as bid-assigned ---
	const pastCompletedIndices: number[] = [];
	for (let i = 0; i < assignments.length; i++) {
		if (
			assignments[i].status === 'completed' &&
			isPastDate(assignments[i].date) &&
			assignments[i].userId
		) {
			pastCompletedIndices.push(i);
		}
	}
	const bidAssignedCount = Math.max(1, Math.floor(pastCompletedIndices.length * 0.15));
	// Shuffle and pick
	for (let i = pastCompletedIndices.length - 1; i > 0; i--) {
		const j = randomInt(0, i + 1);
		[pastCompletedIndices[i], pastCompletedIndices[j]] = [
			pastCompletedIndices[j],
			pastCompletedIndices[i]
		];
	}
	for (let i = 0; i < bidAssignedCount && i < pastCompletedIndices.length; i++) {
		assignments[pastCompletedIndices[i]].assignedBy = 'bid';
	}

	// --- Phase 2b: Generate no-show assignments for unreliable drivers ---
	const noShowIndices: number[] = [];
	for (const unreliableId of personas.unreliable) {
		// Find 1-2 past dates where this driver had completed assignments to create no-shows
		const driverPastCompleted: number[] = [];
		for (let i = 0; i < assignments.length; i++) {
			if (
				assignments[i].userId === unreliableId &&
				assignments[i].status === 'completed' &&
				isPastDate(assignments[i].date)
			) {
				driverPastCompleted.push(i);
			}
		}

		const noShowCount = Math.min(1 + randomInt(0, 2), driverPastCompleted.length);
		for (let n = 0; n < noShowCount; n++) {
			// Pick a completed assignment and convert it to a no-show:
			// status: 'scheduled' (pre-cron state), confirmedAt: set, no shift
			const idx = driverPastCompleted[n];
			assignments[idx].status = 'scheduled';
			assignments[idx].confirmedAt = (() => {
				const daysBeforeShift = 3 + randomInt(0, 3);
				const assignmentDate = new Date(`${assignments[idx].date}T12:00:00`);
				assignmentDate.setDate(assignmentDate.getDate() - daysBeforeShift);
				return randomTimeOnDate(toTorontoDateString(assignmentDate), 8, 22);
			})();
			assignments[idx].cancelType = null;

			// Remove the associated shift
			const shiftIdx = shiftsList.findIndex((s) => s.assignmentIndex === idx);
			if (shiftIdx !== -1) {
				shiftsList.splice(shiftIdx, 1);
			}

			noShowIndices.push(idx);
		}
	}

	return { assignments, shifts: shiftsList, personas, noShowIndices };
}

function findEligibleDriver(
	drivers: GeneratedUser[],
	prefByUser: Map<string, GeneratedPreference>,
	routeId: string,
	dayOfWeek: number,
	weekKey: string,
	weeklyCount: Map<string, Map<string, number>>,
	dailyAssignedForDate: Set<string>,
	dateString: string,
	personas: DriverPersonas
): string | null {
	const eligibleDrivers = drivers.filter((d) => {
		if (d.role !== 'driver') return false;
		if (d.isFlagged) return false;

		// 'new' persona drivers don't get past assignments
		if (isPastDate(dateString) && personas.getPersona(d.id) === 'new') return false;

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

/**
 * Past dates: only completed or cancelled. Never active or scheduled.
 * Persona controls completion rate.
 */
function determineStatusPast(
	persona: PersonaType
): 'completed' | 'cancelled' {
	const roll = random();

	switch (persona) {
		case 'exemplary':
			// 100% completed — no cancellations
			return 'completed';
		case 'good':
			// ~95% completed, ~5% cancelled
			return roll < 0.95 ? 'completed' : 'cancelled';
		case 'unreliable':
			// ~70% completed, ~30% cancelled
			return roll < 0.70 ? 'completed' : 'cancelled';
		default:
			return 'completed';
	}
}

/**
 * Map today lifecycle stage to assignment status.
 */
function todayStageToAssignmentStatus(
	stage: TodayStage
): 'scheduled' | 'active' | 'completed' {
	switch (stage) {
		case 'awaiting_confirm':
		case 'confirmed_arrivable':
			return 'scheduled';
		case 'arrived_startable':
		case 'started_completable':
			return 'active';
		case 'completed_editable':
		case 'completed_locked':
			return 'completed';
	}
}

function createShiftForStatus(
	assignmentIndex: number,
	dateString: string,
	status: 'completed' | 'cancelled' | 'active',
	todayStage: TodayStage | null,
	persona: PersonaType,
	routeStartTime: string | null
): GeneratedShift {
	const now = getSeedNow();
	const todayStr = toTorontoDateString(getTorontoToday());
	const editWindowHours = dispatchPolicy.shifts.completionEditWindowHours;

	// Parse route start time for arrival generation
	const { hours: startHour } = parseRouteStartTime(routeStartTime);
	// Arrivals should be between startTime-2h and startTime
	const arrivalStartHour = Math.max(5, startHour - 2);
	const arrivalEndHour = startHour;

	// Handle deterministic today lifecycle stages
	if (todayStage) {
		return createTodayStageShift(assignmentIndex, todayStr, todayStage, now, editWindowHours);
	}

	const parcelsStart = 100 + randomInt(0, 100); // 100-200

	if (status === 'completed') {
		// Persona-aware delivery rates
		let deliveryRate: number;
		if (persona === 'exemplary') {
			deliveryRate = 0.96 + random() * 0.04; // 96-100%
		} else if (persona === 'unreliable') {
			deliveryRate = 0.82 + random() * 0.13; // 82-95%
		} else {
			deliveryRate = 0.90 + random() * 0.10; // 90-100%
		}
		const parcelsDelivered = Math.floor(parcelsStart * deliveryRate);
		const parcelsReturned = parcelsStart - parcelsDelivered;

		// ~20% of completed shifts get excepted returns
		let exceptedReturns = 0;
		let exceptionNotes: string | null = null;
		if (random() < 0.20) {
			exceptedReturns = 1 + randomInt(0, 3); // 1-3
			exceptionNotes = EXCEPTION_NOTES[randomInt(0, EXCEPTION_NOTES.length)];
		}

		// editableUntil: past completed shifts always have expired edit windows
		const completedAt = randomTimeOnDate(dateString, 14, 20);
		const editableUntil = new Date(completedAt.getTime() + editWindowHours * 60 * 60 * 1000);

		return {
			assignmentIndex,
			arrivedAt: randomTimeOnDate(dateString, arrivalStartHour, arrivalEndHour || arrivalStartHour + 1),
			parcelsStart,
			parcelsDelivered,
			parcelsReturned,
			startedAt: randomTimeOnDate(dateString, arrivalStartHour, startHour + 1),
			completedAt,
			editableUntil,
			exceptedReturns,
			exceptionNotes,
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
			editableUntil: null,
			exceptedReturns: 0,
			exceptionNotes: null,
			cancelledAt: randomTimeOnDate(dateString, 5, 12),
			cancelReason,
			cancelNotes: cancelReason === 'other' ? 'Unexpected circumstances' : null
		};
	}

	// Active - shift started but not completed (non-stage today assignments)
	return {
		assignmentIndex,
		arrivedAt: randomTimeOnDate(todayStr, arrivalStartHour, arrivalEndHour || arrivalStartHour + 1),
		parcelsStart,
		parcelsDelivered: null,
		parcelsReturned: null,
		startedAt: randomTimeOnDate(todayStr, arrivalStartHour, startHour + 1),
		completedAt: null,
		editableUntil: null,
		exceptedReturns: 0,
		exceptionNotes: null,
		cancelledAt: null,
		cancelReason: null,
		cancelNotes: null
	};
}

/**
 * Create a shift record for a deterministic today lifecycle stage.
 */
function createTodayStageShift(
	assignmentIndex: number,
	todayStr: string,
	stage: TodayStage,
	now: Date,
	editWindowHours: number
): GeneratedShift {
	const baseShift: GeneratedShift = {
		assignmentIndex,
		arrivedAt: null,
		parcelsStart: null,
		parcelsDelivered: null,
		parcelsReturned: null,
		startedAt: null,
		completedAt: null,
		editableUntil: null,
		exceptedReturns: 0,
		exceptionNotes: null,
		cancelledAt: null,
		cancelReason: null,
		cancelNotes: null
	};

	const parcelsStart = 150 + randomInt(0, 50); // 150-200

	switch (stage) {
		case 'awaiting_confirm':
			// No shift record needed — assignment status is 'scheduled', no confirmedAt
			// But we still create a minimal shift entry for linking
			// Actually: awaiting_confirm should NOT have a shift. Return base.
			// However the caller only calls us for completed/active/cancelled.
			// For 'scheduled' status stages, the caller won't call us.
			// This shouldn't be reached, but return base for safety.
			return baseShift;

		case 'confirmed_arrivable':
			// No shift record — assignment is 'scheduled' + confirmed
			return baseShift;

		case 'arrived_startable':
			// arrivedAt set, parcelsStart: null (haven't scanned yet)
			return {
				...baseShift,
				arrivedAt: randomTimeOnDate(todayStr, 6, 8)
			};

		case 'started_completable':
			// arrivedAt + startedAt + parcelsStart set
			return {
				...baseShift,
				arrivedAt: randomTimeOnDate(todayStr, 6, 7),
				parcelsStart,
				startedAt: randomTimeOnDate(todayStr, 7, 9)
			};

		case 'completed_editable': {
			// All fields set, editableUntil in the future (55min from now)
			const deliveryRate = 0.94 + random() * 0.06;
			const parcelsDelivered = Math.floor(parcelsStart * deliveryRate);
			const parcelsReturned = parcelsStart - parcelsDelivered;
			const completedAt = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago
			const editableUntil = new Date(
				completedAt.getTime() + editWindowHours * 60 * 60 * 1000
			); // ~55 min remaining

			return {
				...baseShift,
				arrivedAt: randomTimeOnDate(todayStr, 6, 7),
				parcelsStart,
				parcelsDelivered,
				parcelsReturned,
				startedAt: randomTimeOnDate(todayStr, 7, 8),
				completedAt,
				editableUntil
			};
		}

		case 'completed_locked': {
			// All fields set, editableUntil in the past
			const deliveryRate2 = 0.92 + random() * 0.08;
			const parcelsDelivered2 = Math.floor(parcelsStart * deliveryRate2);
			const parcelsReturned2 = parcelsStart - parcelsDelivered2;
			const completedAt2 = randomTimeOnDate(todayStr, 8, 12);
			const editableUntil2 = new Date(
				completedAt2.getTime() + editWindowHours * 60 * 60 * 1000
			);

			return {
				...baseShift,
				arrivedAt: randomTimeOnDate(todayStr, 6, 7),
				parcelsStart,
				parcelsDelivered: parcelsDelivered2,
				parcelsReturned: parcelsReturned2,
				startedAt: randomTimeOnDate(todayStr, 7, 8),
				completedAt: completedAt2,
				editableUntil: editableUntil2
			};
		}
	}
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
 * Generate confirmedAt timestamp based on assignment status and today stage.
 * - completed/active: always confirmed (3-5 days before assignment date)
 * - cancelled: 30% confirmed (late cancellations), 70% null (pre-confirmation drops)
 * - scheduled (future): 60% confirmed, 40% null (haven't confirmed yet)
 * - unfilled: null
 * - Today stages override: awaiting_confirm → null, all others → set
 */
function generateConfirmedAt(
	dateString: string,
	status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled',
	todayStage: TodayStage | null
): Date | null {
	if (status === 'unfilled') return null;

	// Today stage override
	if (todayStage === 'awaiting_confirm') return null;
	if (todayStage) {
		// All other today stages are confirmed
		const daysBeforeShift = 3 + randomInt(0, 3);
		const assignmentDate = new Date(`${dateString}T12:00:00`);
		assignmentDate.setDate(assignmentDate.getDate() - daysBeforeShift);
		return randomTimeOnDate(toTorontoDateString(assignmentDate), 8, 22);
	}

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

/**
 * Ensure at least 1 unconfirmed + 1 confirmed future assignment per active driver.
 * Mutates the assignments array in place.
 */
function guaranteeFutureConfirmations(
	assignments: GeneratedAssignment[],
	futureUnconfirmedByDriver: Map<string, number>,
	futureConfirmedByDriver: Map<string, number>,
	drivers: GeneratedUser[],
	personas: DriverPersonas
): void {
	const activeDriverIds = drivers
		.filter((d) => d.role === 'driver' && personas.getPersona(d.id) !== 'new')
		.map((d) => d.id);

	for (const driverId of activeDriverIds) {
		const unconfirmedCount = futureUnconfirmedByDriver.get(driverId) ?? 0;
		const confirmedCount = futureConfirmedByDriver.get(driverId) ?? 0;

		if (unconfirmedCount === 0 || confirmedCount === 0) {
			// Find future assignments for this driver
			const futureIndices: number[] = [];
			for (let i = 0; i < assignments.length; i++) {
				if (
					assignments[i].userId === driverId &&
					isFutureDate(assignments[i].date) &&
					assignments[i].status === 'scheduled'
				) {
					futureIndices.push(i);
				}
			}

			if (futureIndices.length < 2) continue;

			// Ensure at least 1 unconfirmed
			if (unconfirmedCount === 0) {
				const idx = futureIndices.find((i) => assignments[i].confirmedAt !== null);
				if (idx !== undefined) {
					assignments[idx].confirmedAt = null;
				}
			}

			// Ensure at least 1 confirmed
			if (confirmedCount === 0) {
				const idx = futureIndices.find((i) => assignments[i].confirmedAt === null);
				if (idx !== undefined) {
					const daysBeforeShift = 3 + randomInt(0, 3);
					const assignmentDate = new Date(`${assignments[idx].date}T12:00:00`);
					assignmentDate.setDate(assignmentDate.getDate() - daysBeforeShift);
					assignments[idx].confirmedAt = randomTimeOnDate(
						toTorontoDateString(assignmentDate),
						8,
						22
					);
				}
			}
		}
	}
}
