/**
 * Driver Schemas
 *
 * Source of truth for driver management types.
 * Used by manager dashboard for viewing and updating driver settings.
 */

import { z } from 'zod';

/**
 * Driver with metrics (as returned from API)
 */
export const driverSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().email(),
	phone: z.string().nullable(),
	weeklyCap: z.number().int().min(1).max(6),
	isFlagged: z.boolean(),
	flagWarningDate: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	// Metrics (from driverMetrics table)
	totalShifts: z.number().int().default(0),
	completedShifts: z.number().int().default(0),
	attendanceRate: z.number().min(0).max(1).default(0),
	completionRate: z.number().min(0).max(1).default(0)
});

export type Driver = z.infer<typeof driverSchema>;

/**
 * Schema for updating a driver (PATCH)
 * - weeklyCap: 1-6 days per week
 * - unflag: set to true to remove flag status
 */
export const driverUpdateSchema = z
	.object({
		weeklyCap: z.number().int().min(1).max(6).optional(),
		unflag: z.boolean().optional()
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided'
	});

export type DriverUpdate = z.infer<typeof driverUpdateSchema>;
