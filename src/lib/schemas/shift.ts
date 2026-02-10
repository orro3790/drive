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

export const shiftCompleteSchema = z
	.object({
		assignmentId: z.string().uuid(),
		parcelsReturned: z.number().int().min(0).max(999).default(0),
		exceptedReturns: z.number().int().min(0).max(999).default(0),
		exceptionNotes: z.string().max(500).optional()
	})
	.refine((data) => data.exceptedReturns <= data.parcelsReturned, {
		message: 'Excepted returns cannot exceed total returns',
		path: ['exceptedReturns']
	})
	.refine(
		(data) =>
			data.exceptedReturns === 0 || (data.exceptionNotes && data.exceptionNotes.trim().length > 0),
		{
			message: 'Notes are required when filing return exceptions',
			path: ['exceptionNotes']
		}
	);

export type ShiftCompleteInput = z.infer<typeof shiftCompleteSchema>;

export const shiftEditSchema = z
	.object({
		parcelsStart: z.number().int().min(1).max(999).optional(),
		parcelsReturned: z.number().int().min(0).max(999).optional(),
		exceptedReturns: z.number().int().min(0).max(999).optional(),
		exceptionNotes: z.string().max(500).optional()
	})
	.refine(
		(data) => {
			if (data.exceptedReturns !== undefined && data.parcelsReturned !== undefined) {
				return data.exceptedReturns <= data.parcelsReturned;
			}
			return true;
		},
		{
			message: 'Excepted returns cannot exceed total returns',
			path: ['exceptedReturns']
		}
	)
	.refine(
		(data) => {
			if (data.exceptedReturns !== undefined && data.exceptedReturns > 0) {
				return data.exceptionNotes && data.exceptionNotes.trim().length > 0;
			}
			return true;
		},
		{
			message: 'Notes are required when filing return exceptions',
			path: ['exceptionNotes']
		}
	);

export type ShiftEditInput = z.infer<typeof shiftEditSchema>;
