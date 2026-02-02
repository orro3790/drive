/**
 * Zod schemas for pipeline API responses.
 */

import { z } from 'zod';

export const salesStatusValues = [
	'not_contacted',
	'attempted',
	'contacted',
	'warm',
	'hot',
	'customer',
	'lost'
] as const;
export type SalesStatus = (typeof salesStatusValues)[number];

export const pipelineCardSchema = z.object({
	id: z.string().uuid(),
	sourceName: z.string(),
	sourceDistrict: z.string(),
	sourceCapacityTotal: z.number().nullable(),
	primaryContactPhone: z.string().nullable(),
	salesInterestLevel: z.enum(['cold', 'warm', 'hot']).nullable(),
	salesLastContactAt: z.string().datetime().nullable(),
	salesNextFollowupAt: z.string().datetime().nullable(),
	painPoints: z.array(z.string()).nullable(),
	daysSinceContact: z.number().nullable()
});

export const pipelineColumnSchema = z.object({
	status: z.enum(salesStatusValues),
	count: z.number(),
	academies: z.array(pipelineCardSchema),
	hasMore: z.boolean()
});

export const pipelineResponseSchema = z.object({
	columns: z.array(pipelineColumnSchema),
	todaysWork: z.object({
		followupsDue: z.array(pipelineCardSchema),
		staleDeals: z.array(pipelineCardSchema),
		hotLeads: z.array(pipelineCardSchema)
	})
});

export type PipelineCard = z.infer<typeof pipelineCardSchema>;
export type PipelineColumn = z.infer<typeof pipelineColumnSchema>;
export type PipelineResponse = z.infer<typeof pipelineResponseSchema>;
