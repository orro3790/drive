/**
 * Manager Access Service
 *
 * Helper functions for warehouse access control and manager scoping.
 * Managers are assigned to specific warehouses via the warehouseManagers table.
 * Routes can have a primary manager assigned via routes.managerId.
 */

import { db } from '$lib/server/db';
import { warehouseManagers, routes } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Get all warehouse IDs that a manager has access to.
 *
 * @param userId - The manager's user ID
 * @returns Array of warehouse UUIDs the manager can access
 */
export async function getManagerWarehouseIds(userId: string): Promise<string[]> {
	const results = await db
		.select({ warehouseId: warehouseManagers.warehouseId })
		.from(warehouseManagers)
		.where(eq(warehouseManagers.userId, userId));

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
	warehouseId: string
): Promise<boolean> {
	const [result] = await db
		.select({ id: warehouseManagers.id })
		.from(warehouseManagers)
		.where(and(eq(warehouseManagers.userId, userId), eq(warehouseManagers.warehouseId, warehouseId)))
		.limit(1);

	return !!result;
}

/**
 * Get the primary manager ID for a route.
 *
 * @param routeId - The route UUID
 * @returns The manager's user ID if assigned, null otherwise
 */
export async function getRouteManager(routeId: string): Promise<string | null> {
	const [result] = await db
		.select({ managerId: routes.managerId })
		.from(routes)
		.where(eq(routes.id, routeId));

	return result?.managerId ?? null;
}
