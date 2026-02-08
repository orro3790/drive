/**
 * Notifications Generator
 *
 * Seeds a variety of notification types with mixed read states and timestamps
 * to showcase the inbox UI.
 */

import { addDays, format, parseISO, subDays, subHours, subMinutes } from 'date-fns';
import type { NotificationType } from '../../../src/lib/schemas/api/notifications';
import { notificationTypeValues } from '../../../src/lib/schemas/api/notifications';
import type { GeneratedAssignment } from './assignments';
import type { GeneratedUser } from './users';
import { getSeedNow } from '../utils/runtime';

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

interface NotificationContext {
	routeName: string;
	warehouseName: string;
	dateLabel: string;
	driverName: string;
}

const TYPE_COPY: Record<
	NotificationType,
	(context: NotificationContext) => { title: string; body: string }
> = {
	shift_reminder: ({ routeName }) => ({
		title: 'Shift Reminder',
		body: `Your shift for ${routeName} starts today.`
	}),
	bid_open: ({ routeName }) => ({
		title: 'Shift Available',
		body: `A shift on ${routeName} is open for bidding.`
	}),
	bid_won: ({ routeName, dateLabel }) => ({
		title: 'Bid Won',
		body: `You've won the bid. You are now assigned ${routeName} on ${dateLabel}.`
	}),
	bid_lost: ({ routeName }) => ({
		title: 'Bid Not Won',
		body: `${routeName} was assigned to another driver. No changes to your schedule.`
	}),
	shift_cancelled: ({ routeName, dateLabel }) => ({
		title: 'Shift Cancelled',
		body: `Your shift for ${routeName} on ${dateLabel} has been removed from your schedule.`
	}),
	warning: () => ({
		title: 'Account Warning',
		body: 'Your attendance has dipped below the expected threshold.'
	}),
	manual: () => ({
		title: 'Message from Manager',
		body: 'Please review the latest routing updates for this week.'
	}),
	schedule_locked: () => ({
		title: 'Preferences Locked',
		body: 'Next week preferences are now locked in.'
	}),
	assignment_confirmed: ({ routeName, dateLabel }) => ({
		title: 'Shift Assigned',
		body: `You are now assigned ${routeName} on ${dateLabel}.`
	}),
	route_unfilled: ({ routeName, warehouseName }) => ({
		title: 'Route Unfilled',
		body: `${routeName} at ${warehouseName} has no driver assigned.`
	}),
	route_cancelled: ({ routeName, warehouseName }) => ({
		title: 'Route Cancelled',
		body: `${routeName} at ${warehouseName} has been cancelled. This shift has been removed from your schedule.`
	}),
	driver_no_show: ({ routeName, driverName }) => ({
		title: 'Driver No-Show',
		body: `${driverName} did not show up for ${routeName}.`
	})
};

export function generateNotifications(
	assignments: GeneratedAssignment[],
	users: GeneratedUser[],
	routes: RouteInfo[]
): GeneratedNotification[] {
	const notifications: GeneratedNotification[] = [];
	const now = getSeedNow();
	const timeOffsets = [
		subMinutes(now, 5),
		subMinutes(now, 42),
		subHours(now, 3),
		subDays(now, 1),
		subDays(now, 3),
		subDays(now, 6),
		subDays(now, 10),
		subDays(now, 16)
	];

	const assignmentByUser = new Map<string, GeneratedAssignment[]>();
	for (const assignment of assignments) {
		if (!assignment.userId) continue;
		const existing = assignmentByUser.get(assignment.userId) ?? [];
		existing.push(assignment);
		assignmentByUser.set(assignment.userId, existing);
	}

	const drivers = users.filter((u) => u.role === 'driver');
	const managers = users.filter((u) => u.role === 'manager');
	const showcaseUser = drivers[0] ?? users[0];
	const driverName = drivers[0]?.name ?? 'Driver';

	const allTypes = [...notificationTypeValues] as NotificationType[];

	function pickRoute(index: number): RouteInfo {
		return routes[index % routes.length];
	}

	function pickAssignmentDate(userId: string, index: number): string | null {
		const userAssignments = assignmentByUser.get(userId);
		if (!userAssignments || userAssignments.length === 0) return null;
		return userAssignments[index % userAssignments.length].date;
	}

	function buildNotification(
		userId: string,
		type: NotificationType,
		index: number,
		forcedRoute?: RouteInfo
	): GeneratedNotification {
		const route = forcedRoute ?? pickRoute(index);
		const assignmentDate = pickAssignmentDate(userId, index);
		const createdAt = timeOffsets[index % timeOffsets.length];
		const dateLabel = assignmentDate
			? format(parseISO(assignmentDate), 'MMM d')
			: format(createdAt, 'MMM d');
		const context: NotificationContext = {
			routeName: route.name,
			warehouseName: route.warehouseName,
			dateLabel,
			driverName
		};
		const copy = TYPE_COPY[type](context);
		const read = index % 3 === 0;

		// Some notification types don't need route/warehouse context
		const noContextTypes: NotificationType[] = ['schedule_locked', 'warning', 'manual'];
		const data = noContextTypes.includes(type)
			? null
			: {
					routeName: route.name,
					warehouseName: route.warehouseName,
					date: dateLabel
				};

		return {
			userId,
			type,
			title: copy.title,
			body: copy.body,
			data,
			read,
			createdAt
		};
	}

	const todayLabel = format(now, 'EEE, MMM d');
	const tomorrowLabel = format(addDays(now, 1), 'EEE, MMM d');

	if (showcaseUser) {
		allTypes.forEach((type, index) => {
			notifications.push(buildNotification(showcaseUser.id, type, index));
		});

		// Premium shift notifications (urgent/emergency bid windows)
		const premiumRoute1 = pickRoute(7);
		const premiumRoute2 = pickRoute(8);
		notifications.push({
			userId: showcaseUser.id,
			type: 'bid_open',
			title: 'Shift Available',
			body: `A driver is needed urgently to fill a shift on ${premiumRoute1.name} on ${todayLabel}. Receive +20% wage increase for this shift.`,
			data: {
				routeName: premiumRoute1.name,
				warehouseName: premiumRoute1.warehouseName,
				mode: 'emergency',
				payBonusPercent: '20'
			},
			read: false,
			createdAt: subMinutes(now, 8)
		});
		notifications.push({
			userId: showcaseUser.id,
			type: 'bid_open',
			title: 'Shift Available',
			body: `A driver is needed urgently to fill a shift on ${premiumRoute2.name} on ${tomorrowLabel}. Receive +20% wage increase for this shift.`,
			data: {
				routeName: premiumRoute2.name,
				warehouseName: premiumRoute2.warehouseName,
				mode: 'instant',
				payBonusPercent: '20'
			},
			read: false,
			createdAt: subMinutes(now, 25)
		});
	}

	const secondaryTypes: NotificationType[] = [
		'shift_reminder',
		'bid_open',
		'bid_won',
		'bid_lost',
		'assignment_confirmed',
		'schedule_locked',
		'shift_cancelled',
		'warning',
		'manual'
	];

	for (const driver of drivers.slice(1)) {
		secondaryTypes.forEach((type, index) => {
			notifications.push(buildNotification(driver.id, type, index + 2));
		});

		// Premium shift notification for each secondary driver
		const premRoute = pickRoute(drivers.indexOf(driver));
		notifications.push({
			userId: driver.id,
			type: 'bid_open',
			title: 'Shift Available',
			body: `A driver is needed urgently to fill a shift on ${premRoute.name} on ${todayLabel}. Receive +20% wage increase for this shift.`,
			data: {
				routeName: premRoute.name,
				warehouseName: premRoute.warehouseName,
				mode: 'emergency',
				payBonusPercent: '20'
			},
			read: false,
			createdAt: subMinutes(now, 12)
		});
	}

	const managerTypes: NotificationType[] = [
		'route_unfilled',
		'route_cancelled',
		'driver_no_show',
		'manual',
		'warning'
	];

	for (const manager of managers) {
		managerTypes.forEach((type, index) => {
			notifications.push(buildNotification(manager.id, type, index + 4));
		});
	}

	return notifications;
}
