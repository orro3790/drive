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
import {
	assignments,
	driverHealthState,
	driverMetrics,
	user,
	warehouses
} from '$lib/server/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import {
	dispatchPolicy,
	getAttendanceThreshold,
	isRewardEligible
} from '$lib/config/dispatchPolicy';

type DriverHealthState = 'flagged' | 'at_risk' | 'watch' | 'healthy' | 'high_performer';

type PrimaryWarehouse = {
	warehouseId: string;
	warehouseName: string;
	completedShiftCount: number;
};

function deriveHealthState(driver: {
	isFlagged: boolean;
	totalShifts: number;
	attendanceRate: number;
	completionRate: number;
}): DriverHealthState {
	if (driver.isFlagged) {
		return 'flagged';
	}

	const threshold = getAttendanceThreshold(driver.totalShifts);
	if (driver.attendanceRate < threshold) {
		return 'at_risk';
	}

	if (driver.attendanceRate < threshold + dispatchPolicy.flagging.ui.watchBandAboveThreshold) {
		return 'watch';
	}

	if (
		isRewardEligible(driver.totalShifts, driver.attendanceRate) &&
		driver.completionRate >= dispatchPolicy.flagging.reward.minAttendanceRate
	) {
		return 'high_performer';
	}

	return 'healthy';
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	// Get all drivers with their metrics and health state
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
			avgParcelsDelivered: driverMetrics.avgParcelsDelivered,
			// Health state
			healthScore: driverHealthState.currentScore,
			assignmentPoolEligible: driverHealthState.assignmentPoolEligible
		})
		.from(user)
		.leftJoin(driverMetrics, eq(user.id, driverMetrics.userId))
		.leftJoin(driverHealthState, eq(user.id, driverHealthState.userId))
		.where(eq(user.role, 'driver'))
		.orderBy(user.name);

	const completedAssignmentCounts = await db
		.select({
			driverId: assignments.userId,
			warehouseId: assignments.warehouseId,
			warehouseName: warehouses.name,
			completedShiftCount: sql<number>`count(*)::int`
		})
		.from(assignments)
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(and(eq(assignments.status, 'completed'), isNotNull(assignments.userId)))
		.groupBy(assignments.userId, assignments.warehouseId, warehouses.name);

	const primaryWarehouseByDriver = new Map<string, PrimaryWarehouse>();
	for (const row of completedAssignmentCounts) {
		if (!row.driverId) {
			continue;
		}

		const current = primaryWarehouseByDriver.get(row.driverId);
		if (
			!current ||
			row.completedShiftCount > current.completedShiftCount ||
			(row.completedShiftCount === current.completedShiftCount &&
				row.warehouseName.localeCompare(current.warehouseName) < 0)
		) {
			primaryWarehouseByDriver.set(row.driverId, {
				warehouseId: row.warehouseId,
				warehouseName: row.warehouseName,
				completedShiftCount: row.completedShiftCount
			});
		}
	}

	const avgParcelsByDriver = new Map(
		drivers.map((driver) => [driver.id, driver.avgParcelsDelivered])
	);
	const cohortTotals = new Map<string, { sum: number; count: number }>();

	for (const [driverId, primaryWarehouse] of primaryWarehouseByDriver.entries()) {
		const avgParcels = avgParcelsByDriver.get(driverId);
		if (avgParcels === null || avgParcels === undefined) {
			continue;
		}

		const current = cohortTotals.get(primaryWarehouse.warehouseId);
		if (!current) {
			cohortTotals.set(primaryWarehouse.warehouseId, { sum: avgParcels, count: 1 });
			continue;
		}

		cohortTotals.set(primaryWarehouse.warehouseId, {
			sum: current.sum + avgParcels,
			count: current.count + 1
		});
	}

	const cohortAverages = new Map<string, number>();
	for (const [warehouseId, { sum, count }] of cohortTotals.entries()) {
		if (count > 0) {
			cohortAverages.set(warehouseId, sum / count);
		}
	}

	// Map null metrics to defaults
	const driversWithDefaults = drivers.map((driver) => {
		const totalShifts = driver.totalShifts ?? 0;
		const completedShifts = driver.completedShifts ?? 0;
		const attendanceRate = driver.attendanceRate ?? 0;
		const completionRate = driver.completionRate ?? 0;
		const avgParcelsDelivered = driver.avgParcelsDelivered ?? 0;
		const primaryWarehouse = primaryWarehouseByDriver.get(driver.id) ?? null;
		const warehouseCohortAvgParcels = primaryWarehouse
			? (cohortAverages.get(primaryWarehouse.warehouseId) ?? null)
			: null;
		const avgParcelsDeltaVsCohort =
			driver.avgParcelsDelivered !== null && warehouseCohortAvgParcels !== null
				? driver.avgParcelsDelivered - warehouseCohortAvgParcels
				: null;

		return {
			...driver,
			totalShifts,
			completedShifts,
			attendanceRate,
			completionRate,
			avgParcelsDelivered,
			primaryWarehouseId: primaryWarehouse?.warehouseId ?? null,
			primaryWarehouseName: primaryWarehouse?.warehouseName ?? null,
			warehouseCohortAvgParcels,
			avgParcelsDeltaVsCohort,
			attendanceThreshold: getAttendanceThreshold(totalShifts),
			healthState: deriveHealthState({
				isFlagged: driver.isFlagged,
				totalShifts,
				attendanceRate,
				completionRate
			}),
			healthScore: driver.healthScore ?? null,
			assignmentPoolEligible: driver.assignmentPoolEligible ?? true
		};
	});

	return json({ drivers: driversWithDefaults });
};
