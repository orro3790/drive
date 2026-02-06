/**
 * Driver Metrics API
 *
 * GET /api/metrics - Get current driver's performance metrics.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverMetrics } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can access metrics');
	}

	const [row] = await db
		.select({
			totalShifts: driverMetrics.totalShifts,
			completedShifts: driverMetrics.completedShifts,
			attendanceRate: driverMetrics.attendanceRate,
			completionRate: driverMetrics.completionRate,
			updatedAt: driverMetrics.updatedAt
		})
		.from(driverMetrics)
		.where(eq(driverMetrics.userId, locals.user.id))
		.limit(1);

	return json({
		metrics: {
			totalShifts: row?.totalShifts ?? 0,
			completedShifts: row?.completedShifts ?? 0,
			attendanceRate: row?.attendanceRate ?? 0,
			completionRate: row?.completionRate ?? 0,
			updatedAt: row?.updatedAt ?? null
		}
	});
};
