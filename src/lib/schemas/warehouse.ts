/**
 * Warehouse Schemas
 *
 * Source of truth for warehouse types. All warehouse-related types are derived from these schemas.
 */

import { z } from 'zod';

/**
 * Full warehouse schema (as stored in DB)
 */
export const warehouseSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1, 'Name is required'),
	address: z.string().min(1, 'Address is required'),
	createdBy: z.string().uuid().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date()
});

export type Warehouse = z.infer<typeof warehouseSchema>;

/**
 * Schema for creating a new warehouse (POST)
 */
export const warehouseCreateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
	address: z.string().min(1, 'Address is required').max(500, 'Address too long')
});

export type WarehouseCreate = z.infer<typeof warehouseCreateSchema>;

/**
 * Schema for updating a warehouse (PATCH) - no defaults
 */
export const warehouseUpdateSchema = z
	.object({
		name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
		address: z.string().min(1, 'Address is required').max(500, 'Address too long').optional()
	})
	.strict();

export type WarehouseUpdate = z.infer<typeof warehouseUpdateSchema>;
