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
import { and, count, eq, gte, lte, ne, sql } from 'drizzle-orm';
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

async function getWarehouseMetrics(warehouseId: string) {
	const { startDate, endDate } = getTorontoDateRange();

	const [routeCountRows, assignmentRows, openBidWindowRows, managerCountRows] = await Promise.all([
		db
			.select({ count: count(routes.id) })
			.from(routes)
			.where(eq(routes.warehouseId, warehouseId)),
		db
			.select({
				assignedDriversNext7: sql<number>`count(distinct ${assignments.userId})`,
				unfilledRoutesNext7: sql<number>`count(*) filter (where ${assignments.status} = 'unfilled')`
			})
			.from(assignments)
			.where(
				and(
					eq(assignments.warehouseId, warehouseId),
					gte(assignments.date, startDate),
					lte(assignments.date, endDate),
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

	return {
		routeCount: routeCountResult?.count ?? 0,
		assignedDriversNext7: assignmentCounts?.assignedDriversNext7 ?? 0,
		unfilledRoutesNext7: assignmentCounts?.unfilledRoutesNext7 ?? 0,
		openBidWindows: openBidWindowCount?.count ?? 0,
		managerCount: managerCountResult?.count ?? 0
	};
}

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const { id } = params;

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
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const { id } = params;
	const body = await request.json();
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
		actorId: locals.user.id,
		changes: {
			before: { name: existing.name, address: existing.address },
			after: { name: updated.name, address: updated.address }
		}
	});

	const metrics = await getWarehouseMetrics(id);

	return json({ warehouse: { ...updated, ...metrics } });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const { id } = params;

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
		actorId: locals.user.id,
		changes: {
			before: { name: existing.name, address: existing.address }
		}
	});

	return json({ success: true });
};
