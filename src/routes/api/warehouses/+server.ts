/**
 * Warehouse API - List & Create
 *
 * GET  /api/warehouses - List all warehouses
 * POST /api/warehouses - Create a new warehouse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	assignments,
	bidWindows,
	routes,
	warehouses,
	warehouseManagers
} from '$lib/server/db/schema';
import { warehouseCreateSchema } from '$lib/schemas/warehouse';
import { and, count, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { getManagerWarehouseIds } from '$lib/server/services/managers';
import { createAuditLog } from '$lib/server/services/audit';
import { addDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';

const TORONTO_TZ = 'America/Toronto';

function getTorontoDateRange() {
	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	return {
		startDate: format(torontoNow, 'yyyy-MM-dd'),
		endDate: format(addDays(torontoNow, 7), 'yyyy-MM-dd')
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	// Get warehouses this manager can access
	const accessibleWarehouses = await getManagerWarehouseIds(locals.user.id);
	if (accessibleWarehouses.length === 0) {
		return json({ warehouses: [] });
	}

	const { startDate, endDate } = getTorontoDateRange();

	const [warehouseList, assignmentCounts, openBidWindowCounts, managerCounts] = await Promise.all([
		db
			.select({
				id: warehouses.id,
				name: warehouses.name,
				address: warehouses.address,
				createdBy: warehouses.createdBy,
				createdAt: warehouses.createdAt,
				updatedAt: warehouses.updatedAt,
				routeCount: count(routes.id)
			})
			.from(warehouses)
			.leftJoin(routes, eq(routes.warehouseId, warehouses.id))
			.where(inArray(warehouses.id, accessibleWarehouses))
			.groupBy(warehouses.id)
			.orderBy(warehouses.name),
		db
			.select({
				warehouseId: assignments.warehouseId,
				assignedDriversNext7: sql<number>`count(distinct ${assignments.userId})`,
				unfilledRoutesNext7: sql<number>`count(*) filter (where ${assignments.status} = 'unfilled')`
			})
			.from(assignments)
			.where(
				and(
					inArray(assignments.warehouseId, accessibleWarehouses),
					gte(assignments.date, startDate),
					lte(assignments.date, endDate),
					ne(assignments.status, 'cancelled')
				)
			)
			.groupBy(assignments.warehouseId),
		db
			.select({
				warehouseId: assignments.warehouseId,
				openBidWindows: count(bidWindows.id)
			})
			.from(bidWindows)
			.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
			.where(
				and(inArray(assignments.warehouseId, accessibleWarehouses), eq(bidWindows.status, 'open'))
			)
			.groupBy(assignments.warehouseId),
		db
			.select({
				warehouseId: warehouseManagers.warehouseId,
				managerCount: count(warehouseManagers.userId)
			})
			.from(warehouseManagers)
			.where(inArray(warehouseManagers.warehouseId, accessibleWarehouses))
			.groupBy(warehouseManagers.warehouseId)
	]);

	const assignmentCountsByWarehouse = new Map(
		assignmentCounts.map((row) => [row.warehouseId, row])
	);
	const openBidWindowsByWarehouse = new Map(
		openBidWindowCounts.map((row) => [row.warehouseId, row.openBidWindows])
	);
	const managerCountsByWarehouse = new Map(
		managerCounts.map((row) => [row.warehouseId, row.managerCount])
	);

	const warehousesWithMetrics = warehouseList.map((warehouse) => {
		const assignmentCounts = assignmentCountsByWarehouse.get(warehouse.id);
		return {
			...warehouse,
			assignedDriversNext7: assignmentCounts?.assignedDriversNext7 ?? 0,
			unfilledRoutesNext7: assignmentCounts?.unfilledRoutesNext7 ?? 0,
			openBidWindows: openBidWindowsByWarehouse.get(warehouse.id) ?? 0,
			managerCount: managerCountsByWarehouse.get(warehouse.id) ?? 0
		};
	});

	return json({ warehouses: warehousesWithMetrics });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const body = await request.json();
	const result = warehouseCreateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { name, address } = result.data;

	const [created] = await db
		.insert(warehouses)
		.values({
			name,
			address,
			createdBy: locals.user.id
		})
		.returning();

	// Auto-assign creator as warehouse manager
	await db.insert(warehouseManagers).values({
		warehouseId: created.id,
		userId: locals.user.id
	});

	await createAuditLog({
		entityType: 'warehouse',
		entityId: created.id,
		action: 'create',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			after: { name, address, createdBy: locals.user.id }
		}
	});

	return json(
		{
			warehouse: {
				...created,
				routeCount: 0,
				assignedDriversNext7: 0,
				unfilledRoutesNext7: 0,
				openBidWindows: 0,
				managerCount: 1
			}
		},
		{ status: 201 }
	);
};
