/**
 * Route Schemas
 *
 * Source of truth for route types. All route-related types are derived from these schemas.
 */

import { z } from 'zod';

export const routeStatusSchema = z.enum(['assigned', 'unfilled', 'bidding']);

export type RouteStatus = z.infer<typeof routeStatusSchema>;

export const shiftProgressValues = [
	'unconfirmed',
	'confirmed',
	'arrived',
	'started',
	'completed',
	'no_show',
	'cancelled'
] as const;
export type ShiftProgress = (typeof shiftProgressValues)[number];
export const shiftProgressSchema = z.enum(shiftProgressValues);

const startTimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Full route schema (as stored in DB)
 */
export const routeSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1, 'Name is required'),
	warehouseId: z.string().uuid(),
	startTime: z.string().regex(startTimeRegex, 'Must be HH:MM format'),
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
	managerId: z.string().optional(),
	startTime: z.string().regex(startTimeRegex, 'Must be HH:MM format (e.g., 07:00)')
});

export type RouteCreate = z.infer<typeof routeCreateSchema>;

/**
 * Schema for updating a route (PATCH) - no defaults
 */
export const routeUpdateSchema = z
	.object({
		name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
		warehouseId: z.string().uuid('Warehouse is required').optional(),
		managerId: z.string().nullable().optional(),
		startTime: z.string().regex(startTimeRegex, 'Must be HH:MM format (e.g., 07:00)').optional()
	})
	.strict();

export const routeIdParamsSchema = z.object({
	id: z.string().uuid()
});

export type RouteUpdate = z.infer<typeof routeUpdateSchema>;
