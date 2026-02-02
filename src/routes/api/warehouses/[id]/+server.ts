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
import { warehouses, auditLogs, routes } from '$lib/server/db/schema';
import { warehouseUpdateSchema } from '$lib/schemas/warehouse';
import { eq, count } from 'drizzle-orm';

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

	return json({ warehouse });
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
		return json({ warehouse: existing });
	}

	const [updated] = await db
		.update(warehouses)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(eq(warehouses.id, id))
		.returning();

	// Audit log - skip actorId since Better Auth IDs don't match domain users table
	await db.insert(auditLogs).values({
		entityType: 'warehouse',
		entityId: id,
		action: 'update',
		actorType: 'user',
		changes: updates
	});

	// Get route count for response
	const [routeCountResult] = await db
		.select({ count: count(routes.id) })
		.from(routes)
		.where(eq(routes.warehouseId, id));

	return json({ warehouse: { ...updated, routeCount: routeCountResult?.count ?? 0 } });
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

	// Audit log - skip actorId since Better Auth IDs don't match domain users table
	await db.insert(auditLogs).values({
		entityType: 'warehouse',
		entityId: id,
		action: 'delete',
		actorType: 'user',
		changes: { name: existing.name, address: existing.address }
	});

	return json({ success: true });
};
