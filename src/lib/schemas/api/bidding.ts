/**
 * Bidding API schemas
 */

import { z } from 'zod';

export const bidSubmissionSchema = z
	.object({
		assignmentId: z.string().uuid()
	})
	.strict();

export const bidWindowIdParamsSchema = z.object({
	id: z.string().uuid()
});

export const bidWindowStatusSchema = z.enum(['open', 'resolved', 'all']);

const parseableDateSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => !Number.isNaN(new Date(value).getTime()), {
		message: 'Invalid date'
	});

export const bidWindowListQuerySchema = z.object({
	status: bidWindowStatusSchema.default('all'),
	since: parseableDateSchema.optional(),
	warehouseId: z.string().uuid().optional()
});

export type BidSubmission = z.infer<typeof bidSubmissionSchema>;
export type BidWindowListQuery = z.infer<typeof bidWindowListQuerySchema>;
