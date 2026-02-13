/**
 * Weekly Report Detail API (Manager)
 *
 * GET /api/weekly-reports/[weekStart] - Individual shift records for a specific week
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, routes, shifts, user, warehouses } from '$lib/server/db/schema';
import { and, eq, gte, inArray, isNotNull, lte, desc } from 'drizzle-orm';
import { getDayOfWeekFromDateString, addDaysToDateString } from '$lib/server/time/toronto';
import { getManagerWarehouseIds } from '$lib/server/services/managers';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import type { WeekDetailResponse } from '$lib/schemas/weeklyReports';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	const { weekStart } = params;

	// Validate format before parsing
	if (!DATE_PATTERN.test(weekStart)) {
		throw error(400, 'Invalid date format — expected YYYY-MM-DD');
	}

	// Validate weekStart is a Monday
	let dayOfWeek: number;
	try {
		dayOfWeek = getDayOfWeekFromDateString(weekStart);
	} catch {
		throw error(400, 'Invalid date format');
	}
	if (dayOfWeek !== 1) {
		throw error(400, 'weekStart must be a Monday');
	}

	const accessibleWarehouses = await getManagerWarehouseIds(manager.id, organizationId);
	if (accessibleWarehouses.length === 0) {
		return json({
			weekStart,
			weekEnd: addDaysToDateString(weekStart, 6),
			shifts: []
		} satisfies WeekDetailResponse);
	}

	const weekEnd = addDaysToDateString(weekStart, 6);

	const rows = await db
		.select({
			assignmentId: assignments.id,
			date: assignments.date,
			routeName: routes.name,
			warehouseName: warehouses.name,
			driverName: user.name,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			exceptedReturns: shifts.exceptedReturns,
			exceptionNotes: shifts.exceptionNotes,
			completedAt: shifts.completedAt
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.innerJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.innerJoin(user, eq(assignments.userId, user.id))
		.where(
			and(
				eq(assignments.status, 'completed'),
				isNotNull(shifts.completedAt),
				gte(assignments.date, weekStart),
				lte(assignments.date, weekEnd),
				inArray(assignments.warehouseId, accessibleWarehouses)
			)
		)
		.orderBy(desc(assignments.date));

	return json({
		weekStart,
		weekEnd,
		shifts: rows.map((row) => ({
			assignmentId: row.assignmentId,
			date: row.date,
			routeName: row.routeName,
			warehouseName: row.warehouseName,
			driverName: row.driverName,
			parcelsStart: row.parcelsStart,
			parcelsDelivered: row.parcelsDelivered,
			parcelsReturned: row.parcelsReturned,
			exceptedReturns: row.exceptedReturns ?? 0,
			exceptionNotes: row.exceptionNotes,
			completedAt: row.completedAt?.toISOString() ?? null
		}))
	} satisfies WeekDetailResponse);
};
