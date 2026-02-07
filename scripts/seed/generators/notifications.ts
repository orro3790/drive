/**
 * Notifications Generator
 *
 * Seeds a variety of notification types with mixed read states and timestamps
 * to showcase the inbox UI.
 */

import { format, parseISO, subDays, subHours, subMinutes } from 'date-fns';
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
		title: 'Bid Window Open',
		body: `A new shift on ${routeName} is open for bidding.`
	}),
	bid_won: ({ routeName, dateLabel }) => ({
		title: 'Bid Won',
		body: `You won ${routeName} for ${dateLabel}.`
	}),
	bid_lost: ({ routeName }) => ({
		title: 'Bid Not Selected',
		body: `${routeName} was assigned to another driver.`
	}),
	shift_cancelled: ({ routeName, dateLabel }) => ({
		title: 'Shift Cancelled',
		body: `${routeName} on ${dateLabel} has been cancelled.`
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
		body: `You have been assigned ${routeName} for ${dateLabel}.`
	}),
	route_unfilled: ({ routeName, warehouseName }) => ({
		title: 'Route Unfilled',
		body: `${routeName} at ${warehouseName} has no driver assigned.`
	}),
	route_cancelled: ({ routeName, warehouseName }) => ({
		title: 'Driver Cancelled',
		body: `A driver cancelled ${routeName} at ${warehouseName}.`
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

		return {
			userId,
			type,
			title: copy.title,
			body: copy.body,
			data: {
				routeName: route.name,
				warehouseName: route.warehouseName,
				date: dateLabel
			},
			read,
			createdAt
		};
	}

	if (showcaseUser) {
		allTypes.forEach((type, index) => {
			notifications.push(buildNotification(showcaseUser.id, type, index));
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
