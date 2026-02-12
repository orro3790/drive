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
import { and, count, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { getManagerWarehouseIds } from '$lib/server/services/managers';
import { createAuditLog } from '$lib/server/services/audit';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import { addDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';

const TORONTO_TZ = 'America/Toronto';

function getTorontoDateRanges() {
	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const currentStartDate = format(torontoNow, 'yyyy-MM-dd');
	return {
		currentStartDate,
		currentEndDateExclusive: format(addDays(torontoNow, 7), 'yyyy-MM-dd'),
		previousStartDate: format(addDays(torontoNow, -7), 'yyyy-MM-dd')
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	// Get warehouses this manager can access
	const accessibleWarehouses = await getManagerWarehouseIds(manager.id, organizationId);
	if (accessibleWarehouses.length === 0) {
		return json({ warehouses: [] });
	}

	const { currentStartDate, currentEndDateExclusive, previousStartDate } = getTorontoDateRanges();

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
				assignedDriversNext7: sql<number>`count(distinct ${assignments.userId}) filter (where ${assignments.date} >= ${currentStartDate} and ${assignments.date} < ${currentEndDateExclusive})`,
				assignedDriversPrevious7: sql<number>`count(distinct ${assignments.userId}) filter (where ${assignments.date} >= ${previousStartDate} and ${assignments.date} < ${currentStartDate})`,
				unfilledRoutesNext7: sql<number>`count(*) filter (where ${assignments.status} = 'unfilled' and ${assignments.date} >= ${currentStartDate} and ${assignments.date} < ${currentEndDateExclusive})`,
				unfilledRoutesPrevious7: sql<number>`count(*) filter (where ${assignments.status} = 'unfilled' and ${assignments.date} >= ${previousStartDate} and ${assignments.date} < ${currentStartDate})`
			})
			.from(assignments)
			.where(
				and(
					inArray(assignments.warehouseId, accessibleWarehouses),
					gte(assignments.date, previousStartDate),
					lt(assignments.date, currentEndDateExclusive),
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
		const assignedDriversNext7 = assignmentCounts?.assignedDriversNext7 ?? 0;
		const assignedDriversPrevious7 = assignmentCounts?.assignedDriversPrevious7 ?? 0;
		const unfilledRoutesNext7 = assignmentCounts?.unfilledRoutesNext7 ?? 0;
		const unfilledRoutesPrevious7 = assignmentCounts?.unfilledRoutesPrevious7 ?? 0;

		return {
			...warehouse,
			assignedDriversNext7,
			assignedDriversDelta7: assignedDriversNext7 - assignedDriversPrevious7,
			unfilledRoutesNext7,
			unfilledRoutesDelta7: unfilledRoutesNext7 - unfilledRoutesPrevious7,
			openBidWindows: openBidWindowsByWarehouse.get(warehouse.id) ?? 0,
			managerCount: managerCountsByWarehouse.get(warehouse.id) ?? 0
		};
	});

	return json({ warehouses: warehousesWithMetrics });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user: manager } = requireManagerWithOrg(locals);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

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
			createdBy: manager.id
		})
		.returning();

	// Auto-assign creator as warehouse manager
	await db.insert(warehouseManagers).values({
		warehouseId: created.id,
		userId: manager.id
	});

	await createAuditLog({
		entityType: 'warehouse',
		entityId: created.id,
		action: 'create',
		actorType: 'user',
		actorId: manager.id,
		changes: {
			after: { name, address, createdBy: manager.id }
		}
	});

	return json(
		{
			warehouse: {
				...created,
				routeCount: 0,
				assignedDriversNext7: 0,
				assignedDriversDelta7: 0,
				unfilledRoutesNext7: 0,
				unfilledRoutesDelta7: 0,
				openBidWindows: 0,
				managerCount: 1
			}
		},
		{ status: 201 }
	);
};
