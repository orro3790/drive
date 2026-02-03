/**
 * Driver Preferences Schemas
 *
 * Source of truth for driver preference types.
 * preferredDays: integer array [0-6] where 0=Sunday
 * preferredRoutes: UUID array (max 3)
 */

import { z } from 'zod';

/**
 * Full preferences schema (as stored in DB)
 */
export const preferencesSchema = z.object({
	id: z.string().uuid(),
	userId: z.string(),
	preferredDays: z.array(z.number().int().min(0).max(6)),
	preferredRoutes: z.array(z.string().uuid()),
	updatedAt: z.coerce.date(),
	lockedAt: z.coerce.date().nullable()
});

export type Preferences = z.infer<typeof preferencesSchema>;

/**
 * Schema for updating preferences (PUT)
 */
export const preferencesUpdateSchema = z.object({
	preferredDays: z.array(z.number().int().min(0).max(6)).max(7, 'Cannot select more than 7 days'),
	preferredRoutes: z.array(z.string().uuid()).max(3, 'Cannot select more than 3 routes')
});

export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>;

/**
 * API response schema with lock status
 */
export const preferencesResponseSchema = z.object({
	preferences: preferencesSchema.nullable(),
	isLocked: z.boolean(),
	lockDeadline: z.coerce.date(),
	lockedUntil: z.coerce.date().nullable()
});

export type PreferencesResponse = z.infer<typeof preferencesResponseSchema>;
