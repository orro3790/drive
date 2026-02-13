/**
 * Notifications Generator
 *
 * Generates event-driven notifications tied to actual seed events.
 * Every notification type appears at least once (showcase coverage).
 * Notifications reference real assignment IDs and driver names.
 */

import { format, parseISO, subDays, subHours, subMinutes } from 'date-fns';
import type { NotificationType } from '../../../src/lib/schemas/api/notifications';
import type { GeneratedAssignment, GeneratedShift, DriverPersonas } from './assignments';
import type { GeneratedUser } from './users';
import type { GeneratedBidWindow, GeneratedBid } from './bidding';
import type { GeneratedHealthState } from './health';
import { getSeedNow, randomInt } from '../utils/runtime';
import { isPastDate, isToday, isFutureDate } from '../utils/dates';

export interface RouteInfo {
	id: string;
	name: string;
	warehouseId: string;
	warehouseName: string;
}

export interface GeneratedNotification {
	userId: string;
	type: NotificationType;
	title: string;
	body: string;
	data: Record<string, string> | null;
	read: boolean;
	createdAt: Date;
}

export interface NotificationContext {
	assignments: GeneratedAssignment[];
	shifts: GeneratedShift[];
	bidWindows: GeneratedBidWindow[];
	bids: GeneratedBid[];
	healthStates: GeneratedHealthState[];
	personas: DriverPersonas;
	noShowIndices: number[];
	/** Map from assignment array index to real assignment UUID */
	assignmentIdByIndex: Map<number, string>;
}

/**
 * Generate event-driven notifications from actual seed data.
 */
export function generateNotifications(
	users: GeneratedUser[],
	routes: RouteInfo[],
	context: NotificationContext
): GeneratedNotification[] {
	const notifications: GeneratedNotification[] = [];
	const now = getSeedNow();

	const drivers = users.filter((u) => u.role === 'driver');
	const managers = users.filter((u) => u.role === 'manager');
	const routeById = new Map(routes.map((r) => [r.id, r]));
	const assignmentIdByIndex = context.assignmentIdByIndex;

	// Track which types have been generated (ensure full coverage)
	const generatedTypes = new Set<NotificationType>();

	// Helper: route info for an assignment
	function routeFor(a: GeneratedAssignment): RouteInfo {
		return routeById.get(a.routeId) ?? routes[0];
	}

	function dateLabel(dateStr: string): string {
		return format(parseISO(dateStr), 'MMM d');
	}

	function assignmentData(a: GeneratedAssignment, index: number): Record<string, string> | null {
		const route = routeFor(a);
		const assignmentId = assignmentIdByIndex.get(index);
		const data: Record<string, string> = {
			routeName: route.name,
			warehouseName: route.warehouseName,
			date: dateLabel(a.date)
		};
		if (assignmentId) data.assignmentId = assignmentId;
		return data;
	}

	// --- 1. Completed assignments -> shift_reminder + assignment_confirmed ---
	const completedAssignments: { a: GeneratedAssignment; idx: number }[] = [];
	for (let i = 0; i < context.assignments.length; i++) {
		const a = context.assignments[i];
		if (a.status === 'completed' && a.userId && isPastDate(a.date)) {
			completedAssignments.push({ a, idx: i });
		}
	}

	// Group by user, pick a few per driver
	const completedByUser = new Map<string, { a: GeneratedAssignment; idx: number }[]>();
	for (const item of completedAssignments) {
		const list = completedByUser.get(item.a.userId!) ?? [];
		list.push(item);
		completedByUser.set(item.a.userId!, list);
	}

	for (const [userId, items] of completedByUser) {
		// Pick up to 2 for shift_reminder and assignment_confirmed
		for (let i = 0; i < Math.min(2, items.length); i++) {
			const { a, idx } = items[i];
			const route = routeFor(a);
			const data = assignmentData(a, idx);

			notifications.push({
				userId,
				type: 'shift_reminder',
				title: 'Shift Reminder',
				body: `Your shift for ${route.name} starts today.`,
				data,
				read: true,
				createdAt: subDays(now, randomInt(1, 10))
			});
			generatedTypes.add('shift_reminder');

			notifications.push({
				userId,
				type: 'assignment_confirmed',
				title: 'Shift Assigned',
				body: `You are now assigned ${route.name} on ${dateLabel(a.date)}.`,
				data,
				read: true,
				createdAt: subDays(now, randomInt(3, 14))
			});
			generatedTypes.add('assignment_confirmed');
		}
	}

	// --- 2. Cancelled assignments -> shift_cancelled ---
	for (let i = 0; i < context.assignments.length; i++) {
		const a = context.assignments[i];
		if (a.status === 'cancelled' && a.userId) {
			const route = routeFor(a);
			notifications.push({
				userId: a.userId,
				type: 'shift_cancelled',
				title: 'Shift Cancelled',
				body: `Your shift for ${route.name} on ${dateLabel(a.date)} has been removed from your schedule.`,
				data: assignmentData(a, i),
				read: isPastDate(a.date),
				createdAt: subDays(now, randomInt(1, 8))
			});
			generatedTypes.add('shift_cancelled');
			break; // Just need a few
		}
	}
	// Get a few more for variety
	const cancelledAssignments = context.assignments
		.map((a, i) => ({ a, i }))
		.filter((x) => x.a.status === 'cancelled' && x.a.userId);
	for (const { a, i } of cancelledAssignments.slice(0, 3)) {
		const route = routeFor(a);
		notifications.push({
			userId: a.userId!,
			type: 'shift_cancelled',
			title: 'Shift Cancelled',
			body: `Your shift for ${route.name} on ${dateLabel(a.date)} has been removed from your schedule.`,
			data: assignmentData(a, i),
			read: isPastDate(a.date),
			createdAt: subDays(now, randomInt(1, 8))
		});
	}

	// --- 3. Bid won/lost -> bid_won, bid_lost ---
	for (const bid of context.bids) {
		const a = context.assignments[bid.assignmentIndex];
		if (!a) continue;
		const route = routeFor(a);
		const data = assignmentData(a, bid.assignmentIndex);

		if (bid.status === 'won') {
			notifications.push({
				userId: bid.userId,
				type: 'bid_won',
				title: 'Bid Won',
				body: `You've won the bid. You are now assigned ${route.name} on ${dateLabel(a.date)}.`,
				data,
				read: true,
				createdAt: bid.resolvedAt ?? subDays(now, 2)
			});
			generatedTypes.add('bid_won');
		} else if (bid.status === 'lost') {
			notifications.push({
				userId: bid.userId,
				type: 'bid_lost',
				title: 'Bid Not Won',
				body: `${route.name} was assigned to another driver. No changes to your schedule.`,
				data,
				read: true,
				createdAt: bid.resolvedAt ?? subDays(now, 2)
			});
			generatedTypes.add('bid_lost');
		}
	}

	// --- 4. Open bid windows -> bid_open to eligible drivers ---
	const openWindows = context.bidWindows.filter((w) => w.status === 'open');
	for (const window of openWindows.slice(0, 3)) {
		const a = context.assignments[window.assignmentIndex];
		if (!a) continue;
		const route = routeFor(a);
		const data = assignmentData(a, window.assignmentIndex);

		// Notify first 5 drivers about open bid
		for (const driver of drivers.slice(0, 5)) {
			const isEmergency = window.mode === 'emergency';
			const body = isEmergency
				? `A driver is needed urgently to fill a shift on ${route.name} on ${dateLabel(a.date)}. Receive +${window.payBonusPercent}% wage increase for this shift.`
				: `A shift on ${route.name} is open for bidding.`;

			const bidData = { ...data };
			if (isEmergency || window.mode === 'instant') {
				bidData.mode = window.mode;
			}
			if (window.payBonusPercent > 0) {
				bidData.payBonusPercent = String(window.payBonusPercent);
			}

			notifications.push({
				userId: driver.id,
				type: isEmergency ? 'emergency_route_available' : 'bid_open',
				title: isEmergency ? 'Shift Available' : 'Shift Available',
				body,
				data: bidData,
				read: false,
				createdAt: window.opensAt
			});
			if (isEmergency) generatedTypes.add('emergency_route_available');
			else generatedTypes.add('bid_open');
		}
	}

	// --- 5. No-show -> driver_no_show to managers ---
	for (const noShowIdx of context.noShowIndices) {
		const a = context.assignments[noShowIdx];
		if (!a?.userId) continue;
		const route = routeFor(a);
		const driverUser = users.find((u) => u.id === a.userId);
		const driverName = driverUser?.name ?? 'Unknown Driver';

		for (const manager of managers) {
			notifications.push({
				userId: manager.id,
				type: 'driver_no_show',
				title: 'Driver No-Show',
				body: `${driverName} did not show up for ${route.name}.`,
				data: assignmentData(a, noShowIdx),
				read: false,
				createdAt: subHours(now, randomInt(12, 72))
			});
			generatedTypes.add('driver_no_show');
		}
	}

	// --- 6. Health-based notifications ---
	for (const healthState of context.healthStates) {
		const driver = drivers.find((d) => d.id === healthState.userId);
		if (!driver) continue;

		// Streak advanced (for drivers with stars > 0)
		if (healthState.stars > 0 && healthState.streakWeeks > 0) {
			notifications.push({
				userId: driver.id,
				type: 'streak_advanced',
				title: 'Streak Milestone',
				body: 'Your weekly streak advanced. Keep up the great work.',
				data: null,
				read: healthState.stars < 3, // older milestones are read
				createdAt: subDays(now, healthState.stars * 7)
			});
			generatedTypes.add('streak_advanced');
		}

		// Bonus eligible (4 stars)
		if (healthState.stars >= 4) {
			notifications.push({
				userId: driver.id,
				type: 'bonus_eligible',
				title: 'Bonus Eligible',
				body: 'You reached 4 stars and now qualify for a bonus preview.',
				data: null,
				read: false,
				createdAt: subDays(now, 1)
			});
			generatedTypes.add('bonus_eligible');
		}

		// Hard-stop -> streak_reset
		if (!healthState.assignmentPoolEligible) {
			notifications.push({
				userId: driver.id,
				type: 'streak_reset',
				title: 'Streak Reset',
				body: 'Your weekly streak has been reset after a reliability event.',
				data: null,
				read: false,
				createdAt: subDays(now, randomInt(1, 5))
			});
			generatedTypes.add('streak_reset');
		}
	}

	// --- 7. Auto-dropped shifts ---
	for (let i = 0; i < context.assignments.length; i++) {
		const a = context.assignments[i];
		if (a.cancelType === 'auto_drop' && a.userId) {
			const route = routeFor(a);
			notifications.push({
				userId: a.userId,
				type: 'shift_auto_dropped',
				title: 'Shift Dropped',
				body: `${route.name} on ${dateLabel(a.date)} was removed because it was not confirmed in time.`,
				data: assignmentData(a, i),
				read: true,
				createdAt: subDays(now, randomInt(2, 10))
			});
			generatedTypes.add('shift_auto_dropped');
			break; // Just 1 for showcase
		}
	}

	// --- 8. Future unconfirmed -> confirmation_reminder ---
	for (let i = 0; i < context.assignments.length; i++) {
		const a = context.assignments[i];
		if (a.status === 'scheduled' && a.userId && isFutureDate(a.date) && a.confirmedAt === null) {
			const route = routeFor(a);
			notifications.push({
				userId: a.userId,
				type: 'confirmation_reminder',
				title: 'Confirm Your Shift',
				body: `Please confirm your upcoming shift for ${route.name} on ${dateLabel(a.date)}.`,
				data: assignmentData(a, i),
				read: false,
				createdAt: subHours(now, randomInt(6, 48))
			});
			generatedTypes.add('confirmation_reminder');
			break;
		}
	}

	// --- 9. Schedule locked for all drivers ---
	for (const driver of drivers.slice(0, 5)) {
		notifications.push({
			userId: driver.id,
			type: 'schedule_locked',
			title: 'Preferences Locked',
			body: 'Next week preferences are now locked in.',
			data: null,
			read: true,
			createdAt: subDays(now, 7)
		});
		generatedTypes.add('schedule_locked');
	}

	// --- 10. Exception returns -> return_exception to managers ---
	for (let i = 0; i < context.shifts.length; i++) {
		const s = context.shifts[i];
		if (s.exceptedReturns > 0) {
			const a = context.assignments[s.assignmentIndex];
			if (!a?.userId) continue;
			const route = routeFor(a);
			const driverUser = users.find((u) => u.id === a.userId);
			const driverName = driverUser?.name ?? 'Driver';

			for (const manager of managers.slice(0, 1)) {
				notifications.push({
					userId: manager.id,
					type: 'return_exception',
					title: 'Return Exception Filed',
					body: `${driverName} filed return exceptions on ${route.name}.`,
					data: assignmentData(a, s.assignmentIndex),
					read: false,
					createdAt: subDays(now, randomInt(1, 5))
				});
				generatedTypes.add('return_exception');
			}
			break;
		}
	}

	// --- 11. Route unfilled notifications for managers ---
	for (let i = 0; i < context.assignments.length; i++) {
		const a = context.assignments[i];
		if (a.status === 'unfilled' && isFutureDate(a.date)) {
			const route = routeFor(a);
			for (const manager of managers.slice(0, 1)) {
				notifications.push({
					userId: manager.id,
					type: 'route_unfilled',
					title: 'Route Unfilled',
					body: `${route.name} at ${route.warehouseName} has no driver assigned.`,
					data: assignmentData(a, i),
					read: false,
					createdAt: subDays(now, 1)
				});
				generatedTypes.add('route_unfilled');
			}
			break;
		}
	}

	// --- Showcase fallbacks: ensure every type appears at least once ---
	const allTypes: NotificationType[] = [
		'shift_reminder',
		'bid_open',
		'bid_won',
		'bid_lost',
		'shift_cancelled',
		'warning',
		'manual',
		'schedule_locked',
		'assignment_confirmed',
		'confirmation_reminder',
		'shift_auto_dropped',
		'emergency_route_available',
		'streak_advanced',
		'streak_reset',
		'bonus_eligible',
		'corrective_warning',
		'route_unfilled',
		'route_cancelled',
		'driver_no_show',
		'return_exception',
		'stale_shift_reminder'
	];

	const showcaseUser = drivers[0] ?? users[0];
	if (showcaseUser) {
		const route = routes[0];
		for (const type of allTypes) {
			if (generatedTypes.has(type)) continue;

			const fallbackNotif = createShowcaseFallback(showcaseUser, managers[0], type, route, now);
			if (fallbackNotif) {
				notifications.push(fallbackNotif);
				generatedTypes.add(type);
			}
		}
	}

	return notifications;
}

function createShowcaseFallback(
	driver: GeneratedUser,
	manager: GeneratedUser | undefined,
	type: NotificationType,
	route: RouteInfo,
	now: Date
): GeneratedNotification | null {
	const targetUser = [
		'route_unfilled',
		'route_cancelled',
		'driver_no_show',
		'return_exception'
	].includes(type)
		? manager
		: driver;

	if (!targetUser) return null;

	const dateLabel = format(now, 'MMM d');

	const copyMap: Record<string, { title: string; body: string }> = {
		warning: {
			title: 'Account Warning',
			body: 'Your attendance has dipped below the expected threshold.'
		},
		manual: {
			title: 'Message from Manager',
			body: 'Please review the latest routing updates for this week.'
		},
		corrective_warning: {
			title: 'Completion Rate Warning',
			body: 'Your completion rate dropped below 98%. Improve within 7 days to avoid further impact.'
		},
		route_cancelled: {
			title: 'Route Cancelled',
			body: `${route.name} at ${route.warehouseName} has been cancelled.`
		},
		stale_shift_reminder: {
			title: 'Incomplete Shift',
			body: `You have an incomplete shift from ${dateLabel}. Please close it out to start new shifts.`
		},
		emergency_route_available: {
			title: 'Shift Available',
			body: `Urgent route ${route.name} at ${route.warehouseName} needs coverage on ${dateLabel}.`
		},
		shift_reminder: { title: 'Shift Reminder', body: `Your shift for ${route.name} starts today.` },
		bid_open: { title: 'Shift Available', body: `A shift on ${route.name} is open for bidding.` },
		bid_won: { title: 'Bid Won', body: `You've won the bid for ${route.name} on ${dateLabel}.` },
		bid_lost: { title: 'Bid Not Won', body: `${route.name} was assigned to another driver.` },
		shift_cancelled: {
			title: 'Shift Cancelled',
			body: `Your shift for ${route.name} has been removed.`
		},
		schedule_locked: {
			title: 'Preferences Locked',
			body: 'Next week preferences are now locked in.'
		},
		assignment_confirmed: { title: 'Shift Assigned', body: `You are now assigned ${route.name}.` },
		confirmation_reminder: {
			title: 'Confirm Your Shift',
			body: `Please confirm your shift for ${route.name}.`
		},
		shift_auto_dropped: {
			title: 'Shift Dropped',
			body: `${route.name} was removed — not confirmed in time.`
		},
		streak_advanced: { title: 'Streak Milestone', body: 'Your weekly streak advanced.' },
		streak_reset: { title: 'Streak Reset', body: 'Your streak has been reset.' },
		bonus_eligible: {
			title: 'Bonus Eligible',
			body: 'You reached 4 stars and qualify for a bonus preview.'
		},
		route_unfilled: { title: 'Route Unfilled', body: `${route.name} has no driver assigned.` },
		driver_no_show: {
			title: 'Driver No-Show',
			body: `${driver.name} did not show up for ${route.name}.`
		},
		return_exception: {
			title: 'Return Exception Filed',
			body: `${driver.name} filed return exceptions on ${route.name}.`
		}
	};

	const copy = copyMap[type];
	if (!copy) return null;

	const noContextTypes = [
		'schedule_locked',
		'warning',
		'manual',
		'streak_advanced',
		'streak_reset',
		'bonus_eligible',
		'corrective_warning'
	];

	return {
		userId: targetUser.id,
		type,
		title: copy.title,
		body: copy.body,
		data: noContextTypes.includes(type)
			? null
			: { routeName: route.name, warehouseName: route.warehouseName, date: dateLabel },
		read: true,
		createdAt: subMinutes(now, randomInt(60, 10080)) // 1h to 7d ago
	};
}
