/**
 * Notifications Generator
 *
 * Generates event-driven notifications tied to actual seed events.
 * Every notification type appears at least once (showcase coverage).
 * Notifications reference real assignment IDs and driver names.
 */

import { format, parseISO, subDays, subHours, subMinutes } from 'date-fns';
import type { NotificationType } from '../../../src/lib/schemas/api/notifications';
import type { DemoOrgFixture } from '../demo-fixtures';
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
	demoFixture?: DemoOrgFixture;
	routeManagerIdByRouteId?: Map<string, string>;
	warehouseManagerUserIdsByWarehouseId?: Map<string, string[]>;
}

/**
 * Generate event-driven notifications from actual seed data.
 */
export function generateNotifications(
	users: GeneratedUser[],
	routes: RouteInfo[],
	context: NotificationContext
): GeneratedNotification[] {
	if (context.demoFixture && context.routeManagerIdByRouteId) {
		return generateDemoNotifications(users, routes, context, context.demoFixture);
	}

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

function generateDemoNotifications(
	users: GeneratedUser[],
	routes: RouteInfo[],
	context: NotificationContext,
	fixture: DemoOrgFixture
): GeneratedNotification[] {
	const notifications: GeneratedNotification[] = [];
	const now = getSeedNow();
	const routeById = new Map(routes.map((route) => [route.id, route]));
	const userByEmail = new Map(users.map((user) => [user.email, user]));
	const budgetByUserId = new Map<string, { maxTotal: number; maxUnread: number }>();
	const countsByUserId = new Map<string, { total: number; unread: number }>();
	const seenAssignmentKeys = new Set<string>();
	const assignmentIdByIndex = context.assignmentIdByIndex;
	const bidWindowByStory = new Map(
		context.bidWindows
			.filter((window) => window.storyKey)
			.map((window) => [window.storyKey as string, window])
	);

	for (const driverFixture of fixture.drivers) {
		const user = userByEmail.get(driverFixture.email);
		if (!user) {
			throw new Error(`Missing demo notification user ${driverFixture.email}`);
		}
		budgetByUserId.set(user.id, {
			maxTotal: driverFixture.notificationBudget.maxTotal,
			maxUnread: driverFixture.notificationBudget.maxUnread
		});
	}

	for (const manager of fixture.managers) {
		const user = userByEmail.get(manager.email);
		if (!user) {
			throw new Error(`Missing demo notification manager ${manager.email}`);
		}
		budgetByUserId.set(user.id, { maxTotal: 6, maxUnread: 6 });
	}

	function getUserId(key: string): string {
		const manager = fixture.managers.find((candidate) => candidate.key === key);
		if (manager) {
			const user = userByEmail.get(manager.email);
			if (!user) throw new Error(`Missing demo manager ${manager.email}`);
			return user.id;
		}
		const driver = fixture.drivers.find((candidate) => candidate.key === key);
		if (!driver) throw new Error(`Missing demo fixture user ${key}`);
		const user = userByEmail.get(driver.email);
		if (!user) throw new Error(`Missing demo driver ${driver.email}`);
		return user.id;
	}

	function describeAssignment(index: number | null): {
		data: Record<string, string> | null;
		routeName: string;
		dateLabel: string;
		warehouseName: string;
	} {
		if (index === null) {
			return {
				data: null,
				routeName: 'Route',
				dateLabel: format(now, 'MMM d'),
				warehouseName: 'Warehouse'
			};
		}
		const assignment = context.assignments[index];
		const route = routeById.get(assignment.routeId) ?? routes[0];
		const assignmentId = assignmentIdByIndex.get(index);
		const data: Record<string, string> = {
			routeName: route?.name ?? 'Route',
			warehouseName: route?.warehouseName ?? 'Warehouse',
			date: format(parseISO(assignment.date), 'MMM d')
		};
		if (assignmentId) {
			data.assignmentId = assignmentId;
		}
		return {
			data,
			routeName: route?.name ?? 'Route',
			dateLabel: data.date,
			warehouseName: route?.warehouseName ?? 'Warehouse'
		};
	}

	function addNotification(
		userId: string,
		type: NotificationType,
		assignmentIndex: number | null,
		read: boolean,
		createdAt: Date,
		title: string,
		body: string
	): void {
		const assignmentId =
			assignmentIndex === null
				? 'none'
				: (assignmentIdByIndex.get(assignmentIndex) ?? `idx-${assignmentIndex}`);
		const dedupeKey = `${userId}:${type}:${assignmentId}`;
		if (seenAssignmentKeys.has(dedupeKey)) {
			return;
		}
		const budget = budgetByUserId.get(userId) ?? { maxTotal: 6, maxUnread: 6 };
		const current = countsByUserId.get(userId) ?? { total: 0, unread: 0 };
		if (current.total >= budget.maxTotal) {
			throw new Error(`Notification cap exceeded for ${userId}`);
		}
		if (!read && current.unread >= budget.maxUnread) {
			throw new Error(`Unread notification cap exceeded for ${userId}`);
		}
		const described = describeAssignment(assignmentIndex);
		notifications.push({
			userId,
			type,
			title,
			body,
			data: described.data,
			read,
			createdAt
		});
		seenAssignmentKeys.add(dedupeKey);
		countsByUserId.set(userId, {
			total: current.total + 1,
			unread: current.unread + (read ? 0 : 1)
		});
	}

	function findAssignmentIndex(
		userId: string,
		predicate: (assignment: GeneratedAssignment) => boolean
	): number {
		const index = context.assignments.findIndex(
			(assignment) => assignment.userId === userId && predicate(assignment)
		);
		if (index === -1) {
			throw new Error(`Missing demo assignment for ${userId}`);
		}
		return index;
	}

	if (fixture.slug === 'seed-org-b') {
		for (const driverFixture of fixture.drivers) {
			const userId = getUserId(driverFixture.key);
			const futureConfirmed = context.assignments.findIndex(
				(assignment) =>
					assignment.userId === userId &&
					isFutureDate(assignment.date) &&
					assignment.confirmedAt !== null
			);
			const futureUnconfirmed = context.assignments.findIndex(
				(assignment) =>
					assignment.userId === userId &&
					isFutureDate(assignment.date) &&
					assignment.confirmedAt === null
			);
			if (futureConfirmed !== -1) {
				addNotification(
					userId,
					'assignment_confirmed',
					futureConfirmed,
					true,
					subDays(now, 2),
					'Shift Assigned',
					'Your next Hamilton-area route is already confirmed.'
				);
			}
			if (futureUnconfirmed !== -1) {
				addNotification(
					userId,
					'confirmation_reminder',
					futureUnconfirmed,
					false,
					subHours(now, 10),
					'Confirm Your Shift',
					'One future secondary-org shift is still waiting for confirmation.'
				);
			}
		}

		const managerId = getUserId(fixture.ownerManagerKey);
		if (
			context.assignments.some(
				(assignment) => assignment.userId === null && isFutureDate(assignment.date)
			)
		) {
			const unfilledIndex = context.assignments.findIndex(
				(assignment) => assignment.userId === null && isFutureDate(assignment.date)
			);
			addNotification(
				managerId,
				'route_unfilled',
				unfilledIndex,
				false,
				subHours(now, 4),
				'Route Unfilled',
				'A secondary-org route is open for a basic multi-tenant sanity check.'
			);
		}

		return notifications;
	}

	const driver1 = getUserId('driver001');
	const driver2 = getUserId('driver002');
	const driver3 = getUserId('driver003');
	const driver4 = getUserId('driver004');
	const driver5 = getUserId('driver005');
	const driver6 = getUserId('driver006');
	const driver7 = getUserId('driver007');
	const driver8 = getUserId('driver008');
	const driver9 = getUserId('driver009');
	const driver10 = getUserId('driver010');
	const manager1 = getUserId('manager001');
	const manager2 = getUserId('manager002');

	const driver1Bid = findAssignmentIndex(driver1, (assignment) => assignment.assignedBy === 'bid');
	const driver1Today = findAssignmentIndex(driver1, (assignment) => isToday(assignment.date));
	const driver1Future = findAssignmentIndex(
		driver1,
		(assignment) => isFutureDate(assignment.date) && assignment.confirmedAt !== null
	);
	const driver2Today = findAssignmentIndex(driver2, (assignment) => isToday(assignment.date));
	const driver3Today = findAssignmentIndex(driver3, (assignment) => isToday(assignment.date));
	const driver4Today = findAssignmentIndex(driver4, (assignment) => isToday(assignment.date));
	const driver5Today = findAssignmentIndex(driver5, (assignment) => isToday(assignment.date));
	const driver5FutureUnconfirmed = findAssignmentIndex(
		driver5,
		(assignment) => isFutureDate(assignment.date) && assignment.confirmedAt === null
	);
	const driver6FutureConfirmed = findAssignmentIndex(
		driver6,
		(assignment) => isFutureDate(assignment.date) && assignment.confirmedAt !== null
	);
	const driver7FutureConfirmed = findAssignmentIndex(
		driver7,
		(assignment) => isFutureDate(assignment.date) && assignment.confirmedAt !== null
	);
	const driver7FutureUnconfirmed = findAssignmentIndex(
		driver7,
		(assignment) => isFutureDate(assignment.date) && assignment.confirmedAt === null
	);
	const driver8FutureUnconfirmed = findAssignmentIndex(
		driver8,
		(assignment) => isFutureDate(assignment.date) && assignment.confirmedAt === null
	);
	const driver7Cancel = findAssignmentIndex(
		driver7,
		(assignment) => assignment.cancelType === 'driver'
	);
	const driver9NoShow = context.noShowIndices.find(
		(index) => context.assignments[index]?.userId === driver9
	);
	if (driver9NoShow === undefined) {
		throw new Error('Missing demo no-show assignment for driver009');
	}
	const driver10LateCancels = context.assignments
		.map((assignment, index) => ({ assignment, index }))
		.filter((item) => item.assignment.userId === driver10 && item.assignment.cancelType === 'late')
		.map((item) => item.index);
	if (driver10LateCancels.length < 2) {
		throw new Error('Missing late cancellations for driver010');
	}
	const competitiveOpenIndex = (() => {
		const window = bidWindowByStory.get('competitive-open');
		if (!window) throw new Error('Missing competitive demo bid window');
		return window.assignmentIndex;
	})();
	const instantOpenIndex = (() => {
		const window = bidWindowByStory.get('instant-open');
		if (!window) throw new Error('Missing instant demo bid window');
		return window.assignmentIndex;
	})();

	addNotification(
		driver1,
		'bid_won',
		driver1Bid,
		true,
		subDays(now, 9),
		'Bid Won',
		"You've won the rebalance route and kept your streak moving."
	);
	addNotification(
		driver1,
		'assignment_confirmed',
		driver1Future,
		true,
		subDays(now, 4),
		'Shift Assigned',
		'Two future shifts are locked in for your strongest route lane.'
	);
	addNotification(
		driver1,
		'shift_reminder',
		driver1Today,
		false,
		subHours(now, 2),
		'Shift Reminder',
		'Your confirmed route is ready for arrival check-in this morning.'
	);
	addNotification(
		driver1,
		'streak_advanced',
		driver1Bid,
		true,
		subDays(now, 7),
		'Streak Milestone',
		'Another perfect week kept your streak climbing.'
	);
	addNotification(
		driver1,
		'bonus_eligible',
		driver1Bid,
		false,
		subDays(now, 1),
		'Bonus Eligible',
		'You are still in the top reward tier heading into this week.'
	);

	addNotification(
		driver2,
		'assignment_confirmed',
		driver2Today,
		true,
		subDays(now, 3),
		'Shift Assigned',
		"Today's route is confirmed and ready for scan start."
	);
	addNotification(
		driver2,
		'shift_reminder',
		driver2Today,
		false,
		subHours(now, 3),
		'Shift Reminder',
		'You are on the board today with a strong parcel lane.'
	);
	addNotification(
		driver2,
		'bid_won',
		driver9NoShow,
		true,
		subDays(now, 5),
		'Bid Won',
		'You stepped in on an urgent route and kept service moving.'
	);
	addNotification(
		driver2,
		'streak_advanced',
		driver2Today,
		true,
		subDays(now, 8),
		'Streak Milestone',
		'Your steady run of clean weeks continues.'
	);
	addNotification(
		driver2,
		'bonus_eligible',
		driver2Today,
		false,
		subDays(now, 1),
		'Bonus Eligible',
		'You remain bonus-eligible going into the next schedule cycle.'
	);

	addNotification(
		driver3,
		'assignment_confirmed',
		driver3Today,
		true,
		subDays(now, 2),
		'Shift Assigned',
		"Today's route is confirmed and already underway."
	);
	addNotification(
		driver3,
		'bid_open',
		competitiveOpenIndex,
		false,
		subHours(now, 5),
		'Shift Available',
		'A strong-fit route is open for competitive bidding later this week.'
	);
	addNotification(
		driver3,
		'shift_reminder',
		driver3Today,
		false,
		subHours(now, 4),
		'Shift Reminder',
		'You are already on route and ready to complete the run.'
	);
	addNotification(
		driver3,
		'streak_advanced',
		driver3Today,
		true,
		subDays(now, 6),
		'Streak Milestone',
		'Three standout weeks keep you near the top cohort.'
	);

	addNotification(
		driver4,
		'assignment_confirmed',
		driver4Today,
		true,
		subDays(now, 2),
		'Shift Assigned',
		"Today's route was completed cleanly and is still editable."
	);
	addNotification(
		driver4,
		'shift_reminder',
		driver4Today,
		true,
		subHours(now, 6),
		'Shift Reminder',
		'You had a polished shift this morning with an active edit window.'
	);
	addNotification(
		driver4,
		'manual',
		driver4Today,
		false,
		subMinutes(now, 45),
		'Dispatcher Note',
		'Use this shift as the live edit-window walkthrough example.'
	);
	addNotification(
		driver4,
		'schedule_locked',
		driver4Today,
		true,
		subDays(now, 7),
		'Preferences Locked',
		'Next week preferences are locked and ready for review.'
	);

	addNotification(
		driver5,
		'assignment_confirmed',
		driver5Today,
		true,
		subDays(now, 2),
		'Shift Assigned',
		"Today's route is complete and locked into history."
	);
	addNotification(
		driver5,
		'confirmation_reminder',
		driver5FutureUnconfirmed,
		false,
		subHours(now, 8),
		'Confirm Your Shift',
		'One future shift still needs confirmation before the deadline.'
	);
	addNotification(
		driver5,
		'bid_lost',
		instantOpenIndex,
		true,
		subDays(now, 4),
		'Bid Not Won',
		'Another driver took the late-breaking route before you could claim it.'
	);
	addNotification(
		driver5,
		'schedule_locked',
		driver5Today,
		true,
		subDays(now, 7),
		'Preferences Locked',
		'Your preferred routes are locked for the upcoming week.'
	);

	addNotification(
		driver6,
		'corrective_warning',
		driver6FutureConfirmed,
		false,
		subDays(now, 1),
		'Performance Warning',
		'Completion slipped enough to put you in the watch band.'
	);
	addNotification(
		driver6,
		'bid_open',
		competitiveOpenIndex,
		false,
		subHours(now, 5),
		'Shift Available',
		'A competitive recovery route is open if you want extra work.'
	);
	addNotification(
		driver6,
		'emergency_route_available',
		driver9NoShow,
		false,
		subDays(now, 5),
		'Urgent Route Available',
		'An emergency route opened after a same-day no-show.'
	);
	addNotification(
		driver6,
		'assignment_confirmed',
		driver6FutureConfirmed,
		true,
		subDays(now, 3),
		'Shift Assigned',
		'You still have a confirmed shift on the books this week.'
	);
	addNotification(
		driver6,
		'schedule_locked',
		driver6FutureConfirmed,
		true,
		subDays(now, 7),
		'Preferences Locked',
		'Upcoming route preferences are locked.'
	);

	addNotification(
		driver7,
		'assignment_confirmed',
		driver7FutureConfirmed,
		true,
		subDays(now, 3),
		'Shift Assigned',
		'You have one confirmed shift and one pending confirmation this week.'
	);
	addNotification(
		driver7,
		'confirmation_reminder',
		driver7FutureUnconfirmed,
		false,
		subHours(now, 7),
		'Confirm Your Shift',
		'One scheduled route is still waiting for confirmation.'
	);
	addNotification(
		driver7,
		'bid_open',
		instantOpenIndex,
		false,
		subHours(now, 2),
		'Shift Available',
		'A late route has moved into instant pickup mode.'
	);
	addNotification(
		driver7,
		'shift_cancelled',
		driver7Cancel,
		true,
		subDays(now, 6),
		'Shift Cancelled',
		'A prior driver-initiated cancellation is still in your history.'
	);
	addNotification(
		driver7,
		'schedule_locked',
		driver7FutureConfirmed,
		true,
		subDays(now, 7),
		'Preferences Locked',
		'Preferences are locked ahead of the next schedule publish.'
	);

	addNotification(
		driver8,
		'warning',
		driver8FutureUnconfirmed,
		false,
		subDays(now, 1),
		'Account Warning',
		'Dispatch flagged your account for a closer manager review.'
	);
	addNotification(
		driver8,
		'corrective_warning',
		driver8FutureUnconfirmed,
		false,
		subHours(now, 12),
		'Performance Warning',
		'Mixed recent results are keeping you below bonus range.'
	);
	addNotification(
		driver8,
		'confirmation_reminder',
		driver8FutureUnconfirmed,
		false,
		subHours(now, 6),
		'Confirm Your Shift',
		'Your next shift is still waiting for confirmation.'
	);
	addNotification(
		driver8,
		'assignment_confirmed',
		driver8FutureUnconfirmed,
		true,
		subDays(now, 4),
		'Shift Assigned',
		'You still have steady route access despite the watch status.'
	);

	addNotification(
		driver9,
		'assignment_confirmed',
		driver9NoShow,
		true,
		subDays(now, 6),
		'Shift Assigned',
		'This missed route is the key event in the hard-stop story.'
	);
	addNotification(
		driver9,
		'shift_reminder',
		driver9NoShow,
		true,
		subDays(now, 5),
		'Shift Reminder',
		'A reminder was sent before the missed shift.'
	);
	addNotification(
		driver9,
		'warning',
		driver9NoShow,
		false,
		subDays(now, 4),
		'Account Warning',
		'Dispatch removed you from the assignment pool after the no-show.'
	);
	addNotification(
		driver9,
		'streak_reset',
		driver9NoShow,
		false,
		subDays(now, 4),
		'Streak Reset',
		'The no-show reset your streak and score.'
	);
	addNotification(
		driver9,
		'manual',
		driver9NoShow,
		false,
		subDays(now, 3),
		'Manager Message',
		'Please meet with dispatch before taking another route.'
	);
	addNotification(
		driver9,
		'stale_shift_reminder',
		driver9NoShow,
		true,
		subDays(now, 2),
		'Incomplete Shift',
		'This missed shift is still the active hard-stop example.'
	);

	addNotification(
		driver10,
		'shift_cancelled',
		driver10LateCancels[0],
		true,
		subDays(now, 12),
		'Shift Cancelled',
		'One late cancellation is still within the rolling window.'
	);
	addNotification(
		driver10,
		'shift_cancelled',
		driver10LateCancels[1],
		true,
		subDays(now, 4),
		'Shift Cancelled',
		'A second late cancellation triggered manager intervention.'
	);
	addNotification(
		driver10,
		'warning',
		driver10LateCancels[1],
		false,
		subDays(now, 3),
		'Account Warning',
		'Two late cancellations pushed you into a hard-stop state.'
	);
	addNotification(
		driver10,
		'streak_reset',
		driver10LateCancels[1],
		false,
		subDays(now, 3),
		'Streak Reset',
		'Your reliability streak reset after repeated late drops.'
	);
	addNotification(
		driver10,
		'manual',
		driver10LateCancels[1],
		true,
		subDays(now, 2),
		'Manager Message',
		'Manager follow-up is required before new assignments resume.'
	);
	addNotification(
		driver10,
		'assignment_confirmed',
		driver10LateCancels[0],
		true,
		subDays(now, 15),
		'Shift Assigned',
		'These cancelled assignments started as confirmed shifts.'
	);

	addNotification(
		manager1,
		'driver_no_show',
		driver9NoShow,
		false,
		subDays(now, 5),
		'Driver No-Show',
		'Driver 009 missed a route you own and dispatch had to intervene.'
	);
	addNotification(
		manager1,
		'route_unfilled',
		competitiveOpenIndex,
		false,
		subHours(now, 5),
		'Route Unfilled',
		'A manager-owned route is open in competitive bidding.'
	);
	addNotification(
		manager1,
		'route_cancelled',
		driver7Cancel,
		true,
		subDays(now, 6),
		'Route Cancelled',
		'A route on your roster was dropped by the assigned driver.'
	);

	addNotification(
		manager2,
		'route_unfilled',
		instantOpenIndex,
		false,
		subHours(now, 2),
		'Route Unfilled',
		'A same-day route is sitting in instant mode on your board.'
	);
	addNotification(
		manager2,
		'route_cancelled',
		driver10LateCancels[1],
		true,
		subDays(now, 4),
		'Route Cancelled',
		'A late cancellation hit one of your east-side routes.'
	);

	for (const driverFixture of fixture.drivers) {
		const userId = getUserId(driverFixture.key);
		const totals = countsByUserId.get(userId) ?? { total: 0, unread: 0 };
		if (totals.total > driverFixture.notificationBudget.maxTotal) {
			throw new Error(`Notification cap exceeded for ${driverFixture.email}`);
		}
		if (totals.unread > driverFixture.notificationBudget.maxUnread) {
			throw new Error(`Unread notification cap exceeded for ${driverFixture.email}`);
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
