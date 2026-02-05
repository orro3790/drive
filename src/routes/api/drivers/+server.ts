/**
 * Driver API - List
 *
 * GET /api/drivers - List all drivers with their metrics
 *
 * Returns drivers joined with driverMetrics for manager dashboard.
 * Only accessible by managers.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverMetrics, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	// Get all drivers with their metrics
	const drivers = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			phone: user.phone,
			weeklyCap: user.weeklyCap,
			isFlagged: user.isFlagged,
			flagWarningDate: user.flagWarningDate,
			createdAt: user.createdAt,
			// Metrics
			totalShifts: driverMetrics.totalShifts,
			completedShifts: driverMetrics.completedShifts,
			attendanceRate: driverMetrics.attendanceRate,
			completionRate: driverMetrics.completionRate,
			avgParcelsDelivered: driverMetrics.avgParcelsDelivered
		})
		.from(user)
		.leftJoin(driverMetrics, eq(user.id, driverMetrics.userId))
		.where(eq(user.role, 'driver'))
		.orderBy(user.name);

	// Map null metrics to defaults
	const driversWithDefaults = drivers.map((driver) => ({
		...driver,
		totalShifts: driver.totalShifts ?? 0,
		completedShifts: driver.completedShifts ?? 0,
		attendanceRate: driver.attendanceRate ?? 0,
		completionRate: driver.completionRate ?? 0,
		avgParcelsDelivered: driver.avgParcelsDelivered ?? 0
	}));

	return json({ drivers: driversWithDefaults });
};
