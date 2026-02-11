/**
 * Weekly Reports Summary API (Manager)
 *
 * GET /api/weekly-reports - Aggregated parcel delivery totals per operational week
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, shifts } from '$lib/server/db/schema';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getWeekStartFromDateString, addDaysToDateString } from '$lib/server/time/toronto';
import { getManagerWarehouseIds } from '$lib/server/services/managers';
import type { WeekSummary, WeeklyReportsResponse } from '$lib/schemas/weeklyReports';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatWeekLabel(weekStart: string): string {
	const [year, month, day] = weekStart.split('-').map(Number);
	return `Week of ${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Only managers can access weekly reports');
	}

	const accessibleWarehouses = await getManagerWarehouseIds(locals.user.id);
	if (accessibleWarehouses.length === 0) {
		return json({ weeks: [] } satisfies WeeklyReportsResponse);
	}

	const rows = await db
		.select({
			assignmentId: assignments.id,
			date: assignments.date,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			exceptedReturns: shifts.exceptedReturns
		})
		.from(assignments)
		.innerJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.where(
			and(
				eq(assignments.status, 'completed'),
				isNotNull(shifts.completedAt),
				inArray(assignments.warehouseId, accessibleWarehouses)
			)
		)
		.orderBy(desc(assignments.date))
		.limit(5000);

	// Group by week
	const weekMap = new Map<
		string,
		{ totalDelivered: number; totalReturned: number; totalExcepted: number; shiftCount: number }
	>();

	for (const row of rows) {
		const weekStart = getWeekStartFromDateString(row.date);

		let week = weekMap.get(weekStart);
		if (!week) {
			week = { totalDelivered: 0, totalReturned: 0, totalExcepted: 0, shiftCount: 0 };
			weekMap.set(weekStart, week);
		}

		week.totalDelivered += row.parcelsDelivered ?? 0;
		week.totalReturned += row.parcelsReturned ?? 0;
		week.totalExcepted += row.exceptedReturns ?? 0;
		week.shiftCount++;
	}

	// Convert to sorted array (most recent first)
	const weeks: WeekSummary[] = Array.from(weekMap.entries())
		.sort((a, b) => b[0].localeCompare(a[0]))
		.map(([weekStart, data]) => ({
			weekStart,
			weekEnd: addDaysToDateString(weekStart, 6),
			weekLabel: formatWeekLabel(weekStart),
			totalDelivered: data.totalDelivered,
			totalReturned: data.totalReturned,
			totalExcepted: data.totalExcepted,
			shiftCount: data.shiftCount
		}));

	return json({ weeks } satisfies WeeklyReportsResponse);
};
