/**
 * Driver Schemas
 *
 * Source of truth for driver management types.
 * Used by manager dashboard for viewing and updating driver settings.
 */

import { z } from 'zod';

export const driverHealthStateSchema = z.enum([
	'flagged',
	'at_risk',
	'watch',
	'healthy',
	'high_performer'
]);

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
	completionRate: z.number().min(0).max(1).default(0),
	avgParcelsDelivered: z.number().min(0).default(0),
	primaryWarehouseId: z.string().nullable(),
	primaryWarehouseName: z.string().nullable(),
	warehouseCohortAvgParcels: z.number().min(0).nullable(),
	avgParcelsDeltaVsCohort: z.number().nullable(),
	attendanceThreshold: z.number().min(0).max(1),
	healthState: driverHealthStateSchema,
	// Health state
	healthScore: z.number().nullable().default(null),
	assignmentPoolEligible: z.boolean().default(true)
});

export type Driver = z.infer<typeof driverSchema>;

/**
 * Schema for updating a driver (PATCH)
 * - weeklyCap: 1-6 days per week
 * - unflag: set to true to remove flag status
 * - reinstate: set to true to restore assignment pool eligibility after hard-stop
 */
export const driverUpdateSchema = z
	.object({
		weeklyCap: z.number().int().min(1).max(6).optional(),
		unflag: z.boolean().optional(),
		reinstate: z.boolean().optional()
	})
	.strict()
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided'
	});

export const driverIdParamsSchema = z.object({
	id: z.string().min(1)
});

export type DriverUpdate = z.infer<typeof driverUpdateSchema>;
