/**
 * Warehouse Managers API
 *
 * GET    /api/warehouses/[id]/managers - List managers for warehouse
 * POST   /api/warehouses/[id]/managers - Add manager to warehouse
 * DELETE /api/warehouses/[id]/managers - Remove manager from warehouse
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { warehouseManagers, warehouses, user } from '$lib/server/db/schema';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { and, eq, count } from 'drizzle-orm';
import { z } from 'zod';

const addManagerSchema = z.object({
	userId: z.string().min(1)
});

const removeManagerSchema = z.object({
	userId: z.string().min(1)
});

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'manager') throw error(403, 'Forbidden');

	const { id: warehouseId } = params;

	// Verify caller has access to this warehouse
	const canAccess = await canManagerAccessWarehouse(locals.user.id, warehouseId);
	if (!canAccess) throw error(403, 'No access to this warehouse');

	const managers = await db
		.select({
			id: warehouseManagers.id,
			userId: warehouseManagers.userId,
			userName: user.name,
			userEmail: user.email,
			createdAt: warehouseManagers.createdAt
		})
		.from(warehouseManagers)
		.innerJoin(user, eq(user.id, warehouseManagers.userId))
		.where(eq(warehouseManagers.warehouseId, warehouseId));

	return json({ managers });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'manager') throw error(403, 'Forbidden');

	const { id: warehouseId } = params;

	// Verify caller has access
	const canAccess = await canManagerAccessWarehouse(locals.user.id, warehouseId);
	if (!canAccess) throw error(403, 'No access to this warehouse');

	// Verify warehouse exists
	const [warehouse] = await db
		.select({ id: warehouses.id })
		.from(warehouses)
		.where(eq(warehouses.id, warehouseId));
	if (!warehouse) throw error(404, 'Warehouse not found');

	const body = await request.json();
	const result = addManagerSchema.safeParse(body);
	if (!result.success) throw error(400, 'Validation failed');

	const { userId } = result.data;

	// Verify target user exists and is a manager
	const [targetUser] = await db
		.select({ id: user.id, role: user.role })
		.from(user)
		.where(eq(user.id, userId));

	if (!targetUser) throw error(404, 'User not found');
	if (targetUser.role !== 'manager') throw error(400, 'User must be a manager');

	// Check if already assigned
	const [existing] = await db
		.select({ id: warehouseManagers.id })
		.from(warehouseManagers)
		.where(
			and(eq(warehouseManagers.warehouseId, warehouseId), eq(warehouseManagers.userId, userId))
		);

	if (existing) throw error(409, 'Manager already assigned to warehouse');

	const [created] = await db.insert(warehouseManagers).values({ warehouseId, userId }).returning();

	return json({ warehouseManager: created }, { status: 201 });
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'manager') throw error(403, 'Forbidden');

	const { id: warehouseId } = params;

	// Verify caller has access
	const canAccess = await canManagerAccessWarehouse(locals.user.id, warehouseId);
	if (!canAccess) throw error(403, 'No access to this warehouse');

	const body = await request.json();
	const result = removeManagerSchema.safeParse(body);
	if (!result.success) throw error(400, 'Validation failed');

	const { userId } = result.data;

	// Prevent removing self if only manager
	const [countResult] = await db
		.select({ count: count() })
		.from(warehouseManagers)
		.where(eq(warehouseManagers.warehouseId, warehouseId));

	if (countResult.count <= 1 && userId === locals.user.id) {
		throw error(400, 'Cannot remove last manager from warehouse');
	}

	const deleted = await db
		.delete(warehouseManagers)
		.where(
			and(eq(warehouseManagers.warehouseId, warehouseId), eq(warehouseManagers.userId, userId))
		)
		.returning();

	if (deleted.length === 0) throw error(404, 'Manager assignment not found');

	return json({ success: true });
};
