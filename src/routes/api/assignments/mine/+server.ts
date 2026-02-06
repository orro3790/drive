/**
 * Assignments API - Current Driver Schedule
 *
 * GET /api/assignments/mine - Get current driver's assignments (this week + next week)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, routes, warehouses, shifts } from '$lib/server/db/schema';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { addDays, differenceInCalendarDays, parseISO } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { getWeekStart } from '$lib/server/services/scheduling';
import { calculateConfirmationDeadline } from '$lib/server/services/confirmations';

const TORONTO_TZ = 'America/Toronto';

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

function getHoursUntilShift(dateString: string, nowToronto: Date): number {
	const torontoToday = format(nowToronto, 'yyyy-MM-dd');
	const dayDiff = differenceInCalendarDays(parseISO(dateString), parseISO(torontoToday));
	const currentMinutes = nowToronto.getHours() * 60 + nowToronto.getMinutes();
	return (dayDiff * 24 * 60 - currentMinutes) / 60;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can access assignments');
	}

	const weekStart = getWeekStart(new Date());
	const nextWeekStart = addDays(weekStart, 7);
	const windowEnd = addDays(weekStart, 14);
	const weekStartString = toTorontoDateString(weekStart);
	const nextWeekStartString = toTorontoDateString(nextWeekStart);
	const windowEndString = toTorontoDateString(windowEnd);
	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const torontoToday = format(torontoNow, 'yyyy-MM-dd');

	const rows = await db
		.select({
			id: assignments.id,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt,
			routeName: routes.name,
			warehouseName: warehouses.name,
			shiftId: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			shiftStartedAt: shifts.startedAt,
			shiftCompletedAt: shifts.completedAt,
			shiftArrivedAt: shifts.arrivedAt,
			shiftEditableUntil: shifts.editableUntil
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.where(
			and(
				eq(assignments.userId, locals.user.id),
				gte(assignments.date, weekStartString),
				lt(assignments.date, windowEndString)
			)
		)
		.orderBy(asc(assignments.date));

	const assignmentsWithFlags = rows.map((assignment) => {
		const isCancelable = assignment.date > torontoToday && assignment.status !== 'cancelled';
		const hoursUntilShift = getHoursUntilShift(assignment.date, torontoNow);
		const isLateCancel = isCancelable && hoursUntilShift <= 48;

		const isToday = assignment.date === torontoToday;
		const isArrivable =
			isToday &&
			assignment.status === 'scheduled' &&
			assignment.confirmedAt !== null &&
			!assignment.shiftArrivedAt;
		const isStartable =
			assignment.status === 'active' &&
			assignment.shiftArrivedAt !== null &&
			assignment.parcelsStart === null;
		const isCompletable =
			assignment.status === 'active' &&
			assignment.parcelsStart !== null &&
			assignment.shiftCompletedAt === null;

		const { opensAt, deadline } = calculateConfirmationDeadline(assignment.date);
		const isConfirmable =
			!assignment.confirmedAt &&
			assignment.status === 'scheduled' &&
			torontoNow >= opensAt &&
			torontoNow <= deadline;

		return {
			id: assignment.id,
			date: assignment.date,
			status: assignment.status,
			confirmedAt: assignment.confirmedAt?.toISOString() ?? null,
			confirmationOpensAt: opensAt.toISOString(),
			confirmationDeadline: deadline.toISOString(),
			isConfirmable,
			routeName: assignment.routeName,
			warehouseName: assignment.warehouseName,
			isCancelable,
			isLateCancel,
			isArrivable,
			isStartable,
			isCompletable,
			shift: assignment.shiftId
				? {
						id: assignment.shiftId,
						arrivedAt: assignment.shiftArrivedAt,
						parcelsStart: assignment.parcelsStart,
						parcelsDelivered: assignment.parcelsDelivered,
						parcelsReturned: assignment.parcelsReturned,
						startedAt: assignment.shiftStartedAt,
						completedAt: assignment.shiftCompletedAt,
						editableUntil: assignment.shiftEditableUntil
					}
				: null
		};
	});

	return json({
		weekStart: weekStartString,
		nextWeekStart: nextWeekStartString,
		assignments: assignmentsWithFlags
	});
};
