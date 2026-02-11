/**
 * Driver Shift History API (Manager)
 *
 * GET /api/drivers/[id]/shifts - Get all completed and cancelled shift records
 * for a specific driver. Used by the DriverShiftHistoryTable on the /drivers page.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, routes, shifts, user, warehouses } from '$lib/server/db/schema';
import { and, eq, inArray, desc } from 'drizzle-orm';
import type { DriverShiftHistoryResponse } from '$lib/schemas/driverShiftHistory';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Only managers can access this endpoint');
	}

	const { id } = params;

	// Verify target user exists and is a driver
	const [target] = await db
		.select({ id: user.id, role: user.role, name: user.name })
		.from(user)
		.where(eq(user.id, id));

	if (!target) {
		throw error(404, 'Driver not found');
	}

	if (target.role !== 'driver') {
		throw error(400, 'User is not a driver');
	}

	// Query all completed + cancelled assignments with shift data
	const rows = await db
		.select({
			assignmentId: assignments.id,
			date: assignments.date,
			routeName: routes.name,
			warehouseName: warehouses.name,
			status: assignments.status,
			cancelType: assignments.cancelType,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			exceptedReturns: shifts.exceptedReturns,
			exceptionNotes: shifts.exceptionNotes,
			arrivedAt: shifts.arrivedAt,
			startedAt: shifts.startedAt,
			completedAt: shifts.completedAt
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.where(and(eq(assignments.userId, id), inArray(assignments.status, ['completed', 'cancelled'])))
		.orderBy(desc(assignments.date))
		.limit(500);

	return json({
		driverName: target.name,
		shifts: rows.map((row) => ({
			...row,
			status: row.status as 'completed' | 'cancelled',
			arrivedAt: row.arrivedAt?.toISOString() ?? null,
			startedAt: row.startedAt?.toISOString() ?? null,
			completedAt: row.completedAt?.toISOString() ?? null
		}))
	} satisfies DriverShiftHistoryResponse);
};
