/**
 * Shift Schemas
 *
 * Validation schemas for shift arrive/start/complete/edit inputs.
 */

import { z } from 'zod';

export const shiftArriveSchema = z.object({
	assignmentId: z.string().uuid()
});

export type ShiftArriveInput = z.infer<typeof shiftArriveSchema>;

export const shiftStartSchema = z.object({
	assignmentId: z.string().uuid(),
	parcelsStart: z.number().int().min(1).max(999)
});

export type ShiftStartInput = z.infer<typeof shiftStartSchema>;

export const shiftCompleteSchema = z.object({
	assignmentId: z.string().uuid(),
	parcelsReturned: z.number().int().min(0).max(999).default(0)
});

export type ShiftCompleteInput = z.infer<typeof shiftCompleteSchema>;

export const shiftEditSchema = z.object({
	parcelsStart: z.number().int().min(1).max(999).optional(),
	parcelsReturned: z.number().int().min(0).max(999).optional()
});

export type ShiftEditInput = z.infer<typeof shiftEditSchema>;
