/**
 * Warehouse API - Get, Update, Delete
 *
 * GET    /api/warehouses/[id] - Get a single warehouse
 * PATCH  /api/warehouses/[id] - Update a warehouse
 * DELETE /api/warehouses/[id] - Delete a warehouse (if no routes attached)
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
import { warehouseUpdateSchema } from '$lib/schemas/warehouse';
import { and, count, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { createAuditLog } from '$lib/server/services/audit';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import { addDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { z } from 'zod';

const TORONTO_TZ = 'America/Toronto';
const warehouseIdParamsSchema = z.object({ id: z.string().uuid() });

function getTorontoDateRanges() {
	const torontoNow = toZonedTime(new Date(), TORONTO_TZ);
	const currentStartDate = format(torontoNow, 'yyyy-MM-dd');
	return {
		currentStartDate,
		currentEndDateExclusive: format(addDays(torontoNow, 7), 'yyyy-MM-dd'),
		previousStartDate: format(addDays(torontoNow, -7), 'yyyy-MM-dd')
	};
}

async function getWarehouseMetrics(warehouseId: string) {
	const { currentStartDate, currentEndDateExclusive, previousStartDate } = getTorontoDateRanges();

	const [routeCountRows, assignmentRows, openBidWindowRows, managerCountRows] = await Promise.all([
		db
			.select({ count: count(routes.id) })
			.from(routes)
			.where(eq(routes.warehouseId, warehouseId)),
		db
			.select({
				assignedDriversNext7: sql<number>`count(distinct ${assignments.userId}) filter (where ${assignments.date} >= ${currentStartDate} and ${assignments.date} < ${currentEndDateExclusive})`,
				assignedDriversPrevious7: sql<number>`count(distinct ${assignments.userId}) filter (where ${assignments.date} >= ${previousStartDate} and ${assignments.date} < ${currentStartDate})`,
				unfilledRoutesNext7: sql<number>`count(*) filter (where ${assignments.status} = 'unfilled' and ${assignments.date} >= ${currentStartDate} and ${assignments.date} < ${currentEndDateExclusive})`,
				unfilledRoutesPrevious7: sql<number>`count(*) filter (where ${assignments.status} = 'unfilled' and ${assignments.date} >= ${previousStartDate} and ${assignments.date} < ${currentStartDate})`
			})
			.from(assignments)
			.where(
				and(
					eq(assignments.warehouseId, warehouseId),
					gte(assignments.date, previousStartDate),
					lt(assignments.date, currentEndDateExclusive),
					ne(assignments.status, 'cancelled')
				)
			),
		db
			.select({ count: count(bidWindows.id) })
			.from(bidWindows)
			.innerJoin(assignments, eq(bidWindows.assignmentId, assignments.id))
			.where(and(eq(assignments.warehouseId, warehouseId), eq(bidWindows.status, 'open'))),
		db
			.select({ count: count(warehouseManagers.userId) })
			.from(warehouseManagers)
			.where(eq(warehouseManagers.warehouseId, warehouseId))
	]);

	const routeCountResult = routeCountRows[0];
	const assignmentCounts = assignmentRows[0];
	const openBidWindowCount = openBidWindowRows[0];
	const managerCountResult = managerCountRows[0];
	const assignedDriversNext7 = assignmentCounts?.assignedDriversNext7 ?? 0;
	const assignedDriversPrevious7 = assignmentCounts?.assignedDriversPrevious7 ?? 0;
	const unfilledRoutesNext7 = assignmentCounts?.unfilledRoutesNext7 ?? 0;
	const unfilledRoutesPrevious7 = assignmentCounts?.unfilledRoutesPrevious7 ?? 0;

	return {
		routeCount: routeCountResult?.count ?? 0,
		assignedDriversNext7,
		assignedDriversDelta7: assignedDriversNext7 - assignedDriversPrevious7,
		unfilledRoutesNext7,
		unfilledRoutesDelta7: unfilledRoutesNext7 - unfilledRoutesPrevious7,
		openBidWindows: openBidWindowCount?.count ?? 0,
		managerCount: managerCountResult?.count ?? 0
	};
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	const paramsResult = warehouseIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid warehouse ID');
	}

	const { id } = paramsResult.data;
	const canAccess = await canManagerAccessWarehouse(manager.id, id, organizationId);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

	const [warehouse] = await db
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
		.where(eq(warehouses.id, id))
		.groupBy(warehouses.id);

	if (!warehouse) {
		throw error(404, 'Warehouse not found');
	}

	const metrics = await getWarehouseMetrics(id);

	return json({ warehouse: { ...warehouse, ...metrics } });
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	const paramsResult = warehouseIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid warehouse ID');
	}

	const { id } = paramsResult.data;
	const canAccess = await canManagerAccessWarehouse(manager.id, id, organizationId);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = warehouseUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	// Check warehouse exists
	const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id));

	if (!existing) {
		throw error(404, 'Warehouse not found');
	}

	const updates = result.data;

	// Only update if there are changes
	if (Object.keys(updates).length === 0) {
		const metrics = await getWarehouseMetrics(id);
		return json({ warehouse: { ...existing, ...metrics } });
	}

	const [updated] = await db
		.update(warehouses)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(eq(warehouses.id, id))
		.returning();

	await createAuditLog({
		entityType: 'warehouse',
		entityId: id,
		action: 'update',
		actorType: 'user',
		actorId: manager.id,
		changes: {
			before: { name: existing.name, address: existing.address },
			after: { name: updated.name, address: updated.address }
		}
	});

	const metrics = await getWarehouseMetrics(id);

	return json({ warehouse: { ...updated, ...metrics } });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	const paramsResult = warehouseIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid warehouse ID');
	}

	const { id } = paramsResult.data;
	const canAccess = await canManagerAccessWarehouse(manager.id, id, organizationId);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

	// Check warehouse exists
	const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id));

	if (!existing) {
		throw error(404, 'Warehouse not found');
	}

	// Check for attached routes
	const [routeCountResult] = await db
		.select({ count: count(routes.id) })
		.from(routes)
		.where(eq(routes.warehouseId, id));

	if (routeCountResult && routeCountResult.count > 0) {
		throw error(400, 'Cannot delete warehouse with attached routes');
	}

	await db.delete(warehouses).where(eq(warehouses.id, id));

	await createAuditLog({
		entityType: 'warehouse',
		entityId: id,
		action: 'delete',
		actorType: 'user',
		actorId: manager.id,
		changes: {
			before: { name: existing.name, address: existing.address }
		}
	});

	return json({ success: true });
};
