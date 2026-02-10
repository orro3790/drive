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
import { addDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { getWeekStart } from '$lib/server/services/scheduling';
import {
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';

const TORONTO_TZ = 'America/Toronto';

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
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
	const lifecycleContext = createAssignmentLifecycleContext();

	const rows = await db
		.select({
			id: assignments.id,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt,
			routeName: routes.name,
			routeStartTime: routes.startTime,
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
		const lifecycle = deriveAssignmentLifecycle(
			{
				assignmentDate: assignment.date,
				assignmentStatus: assignment.status,
				confirmedAt: assignment.confirmedAt,
				shiftArrivedAt: assignment.shiftArrivedAt,
				parcelsStart: assignment.parcelsStart,
				shiftCompletedAt: assignment.shiftCompletedAt,
				routeStartTime: assignment.routeStartTime
			},
			lifecycleContext
		);

		return {
			id: assignment.id,
			date: assignment.date,
			status: assignment.status,
			confirmedAt: assignment.confirmedAt?.toISOString() ?? null,
			confirmationOpensAt: lifecycle.confirmationOpensAt.toISOString(),
			confirmationDeadline: lifecycle.confirmationDeadline.toISOString(),
			isConfirmable: lifecycle.isConfirmable,
			routeName: assignment.routeName,
			routeStartTime: assignment.routeStartTime,
			warehouseName: assignment.warehouseName,
			isCancelable: lifecycle.isCancelable,
			isLateCancel: lifecycle.isLateCancel,
			isArrivable: lifecycle.isArrivable,
			isStartable: lifecycle.isStartable,
			isCompletable: lifecycle.isCompletable,
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
