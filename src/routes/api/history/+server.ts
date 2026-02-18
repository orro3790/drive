/**
 * History API - Driver Shift History
 *
 * GET /api/history - Get past shifts for current driver (completed or past date)
 * Supports pagination with offset/limit query params.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, routes, warehouses, shifts } from '$lib/server/db/schema';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';
import { requireDriverWithOrg } from '$lib/server/org-scope';

const TORONTO_TZ = 'America/Toronto';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = requireDriverWithOrg(locals);

	// Parse pagination params
	const offsetParam = url.searchParams.get('offset');
	const limitParam = url.searchParams.get('limit');
	const offset = Math.max(0, parseInt(offsetParam ?? '0', 10) || 0);
	const limit = Math.min(
		MAX_LIMIT,
		Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
	);

	const todayString = toTorontoDateString(new Date());

	// Get total count for pagination
	const [countResult] = await db
		.select({ count: sql<number>`count(*)` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, user.id),
				or(eq(assignments.status, 'completed'), lt(assignments.date, todayString))
			)
		);
	const totalCount = Number(countResult?.count ?? 0);

	// Get paginated history
	const rows = await db
		.select({
			id: assignments.id,
			date: assignments.date,
			status: assignments.status,
			routeName: routes.name,
			warehouseName: warehouses.name,
			shiftId: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			exceptedReturns: shifts.exceptedReturns,
			exceptionNotes: shifts.exceptionNotes,
			arrivedAt: shifts.arrivedAt,
			completedAt: shifts.completedAt
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.where(
			and(
				eq(assignments.userId, user.id),
				or(eq(assignments.status, 'completed'), lt(assignments.date, todayString))
			)
		)
		.orderBy(desc(assignments.date))
		.limit(limit)
		.offset(offset);

	const history = rows.map((row) => ({
		id: row.id,
		date: row.date,
		status: row.status,
		routeName: row.routeName,
		warehouseName: row.warehouseName,
		shift: row.shiftId
			? {
					parcelsStart: row.parcelsStart,
					parcelsDelivered: row.parcelsDelivered,
					parcelsReturned: row.parcelsReturned,
					exceptedReturns: row.exceptedReturns ?? 0,
					exceptionNotes: row.exceptionNotes,
					arrivedAt: row.arrivedAt?.toISOString() ?? null,
					completedAt: row.completedAt?.toISOString() ?? null
				}
			: null
	}));

	return json({
		history,
		pagination: {
			offset,
			limit,
			total: totalCount,
			hasMore: offset + history.length < totalCount
		}
	});
};
