/**
 * Route Schemas
 *
 * Source of truth for route types. All route-related types are derived from these schemas.
 */

import { z } from 'zod';

export const routeStatusSchema = z.enum(['assigned', 'unfilled', 'bidding']);

export type RouteStatus = z.infer<typeof routeStatusSchema>;

/**
 * Full route schema (as stored in DB)
 */
export const routeSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1, 'Name is required'),
	warehouseId: z.string().uuid(),
	createdBy: z.string().uuid().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export type Route = z.infer<typeof routeSchema>;

/**
 * Schema for creating a new route (POST)
 */
export const routeCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
	warehouseId: z.string().uuid('Warehouse is required'),
	managerId: z.string().optional()
});

export type RouteCreate = z.infer<typeof routeCreateSchema>;

/**
 * Schema for updating a route (PATCH) - no defaults
 */
export const routeUpdateSchema = z
	.object({
		name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
		warehouseId: z.string().uuid('Warehouse is required').optional()
	})
	.strict();

export type RouteUpdate = z.infer<typeof routeUpdateSchema>;
