/**
 * Shift Schemas
 *
 * Validation schemas for shift start/complete inputs.
 */

import { z } from 'zod';

export const shiftStartSchema = z.object({
	assignmentId: z.string().uuid(),
	parcelsStart: z.number().int().min(0).max(999)
});

export type ShiftStartInput = z.infer<typeof shiftStartSchema>;

export const shiftCompleteSchema = z.object({
	assignmentId: z.string().uuid(),
	parcelsDelivered: z.number().int().min(0).max(999),
	parcelsReturned: z.number().int().min(0).max(999).default(0)
});

export type ShiftCompleteInput = z.infer<typeof shiftCompleteSchema>;
