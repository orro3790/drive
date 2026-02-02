/**
 * Zod schemas for marking academies as closed.
 *
 * Used by /api/academies/close endpoint.
 */

import { z } from 'zod';

/**
 * Request schema for marking academies as closed.
 */
export const closeRequestSchema = z.object({
	academyIds: z.array(z.string().uuid()).min(1).max(100)
});

export type CloseRequest = z.infer<typeof closeRequestSchema>;

/**
 * Response schema for marking academies as closed.
 */
export const closeResponseSchema = z.object({
	updatedIds: z.array(z.string().uuid()),
	count: z.number()
});

export type CloseResponse = z.infer<typeof closeResponseSchema>;
