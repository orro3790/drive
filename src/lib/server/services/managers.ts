/**
 * Manager Access Service
 *
 * Helper functions for warehouse access control and manager scoping.
 * Managers are assigned to specific warehouses via the warehouseManagers table.
 * Routes can have a primary manager assigned via routes.managerId.
 */

import { db } from '$lib/server/db';
import { warehouseManagers, routes, user, warehouses } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Get all warehouse IDs that a manager has access to.
 *
 * @param userId - The manager's user ID
 * @returns Array of warehouse UUIDs the manager can access
 */
export async function getManagerWarehouseIds(
	userId: string,
	organizationId: string
): Promise<string[]> {
	if (!organizationId) {
		return [];
	}

	const results = await db
		.select({ warehouseId: warehouseManagers.warehouseId })
		.from(warehouseManagers)
		.innerJoin(warehouses, eq(warehouses.id, warehouseManagers.warehouseId))
		.where(
			and(eq(warehouseManagers.userId, userId), eq(warehouses.organizationId, organizationId))
		);

	return results.map((r) => r.warehouseId);
}

/**
 * Check if a manager has access to a specific warehouse.
 *
 * @param userId - The manager's user ID
 * @param warehouseId - The warehouse UUID to check access for
 * @returns true if the manager can access the warehouse, false otherwise
 */
export async function canManagerAccessWarehouse(
	userId: string,
	warehouseId: string,
	organizationId: string
): Promise<boolean> {
	if (!organizationId) {
		return false;
	}

	const [result] = await db
		.select({ id: warehouseManagers.id })
		.from(warehouseManagers)
		.innerJoin(warehouses, eq(warehouses.id, warehouseManagers.warehouseId))
		.where(
			and(
				eq(warehouseManagers.userId, userId),
				eq(warehouseManagers.warehouseId, warehouseId),
				eq(warehouses.organizationId, organizationId)
			)
		)
		.limit(1);

	return !!result;
}

/**
 * Get the primary manager ID for a route.
 *
 * @param routeId - The route UUID
 * @returns The manager's user ID if assigned, null otherwise
 */
export async function getRouteManager(
	routeId: string,
	organizationId: string
): Promise<string | null> {
	if (!organizationId) {
		return null;
	}

	const [result] = await db
		.select({ managerId: routes.managerId })
		.from(routes)
		.innerJoin(warehouses, eq(warehouses.id, routes.warehouseId))
		.leftJoin(user, eq(user.id, routes.managerId))
		.where(
			and(
				eq(routes.id, routeId),
				eq(warehouses.organizationId, organizationId),
				eq(user.organizationId, organizationId)
			)
		);

	return result?.managerId ?? null;
}
