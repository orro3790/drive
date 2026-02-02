/**
 * Warehouse API - List & Create
 *
 * GET  /api/warehouses - List all warehouses
 * POST /api/warehouses - Create a new warehouse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { warehouses, auditLogs, routes } from '$lib/server/db/schema';
import { warehouseCreateSchema } from '$lib/schemas/warehouse';
import { eq, count } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const warehouseList = await db
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
		.groupBy(warehouses.id)
		.orderBy(warehouses.name);

	return json({ warehouses: warehouseList });
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

	// Audit log
	await db.insert(auditLogs).values({
		entityType: 'warehouse',
		entityId: created.id,
		action: 'create',
		actorId: locals.user.id,
		actorType: 'user',
		changes: { name, address }
	});

	return json({ warehouse: { ...created, routeCount: 0 } }, { status: 201 });
};
