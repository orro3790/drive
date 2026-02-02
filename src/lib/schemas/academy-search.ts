/**
 * Zod schemas for academy search API.
 *
 * Used by /api/academies/search endpoint.
 */

import { z } from 'zod';

/**
 * Search request filters.
 */
export const searchFiltersSchema = z
	.object({
		district: z.string().optional(),
		salesStatus: z.string().optional(),
		status: z.string().optional()
	})
	.optional();

/**
 * Search request schema.
 * Empty query defaults to '*' which matches all documents in Typesense.
 */
export const searchRequestSchema = z.object({
	query: z.string().default('*'),
	filters: searchFiltersSchema,
	page: z.number().int().min(1).default(1),
	perPage: z.number().int().min(1).max(100).default(20)
});

export type SearchRequest = z.infer<typeof searchRequestSchema>;

/**
 * Single search hit.
 */
export const searchHitSchema = z.object({
	id: z.string(),
	sourceId: z.string(),
	name: z.string(),
	district: z.string(),
	address: z.string(),
	phone: z.string().nullable().optional(),
	capacityTotal: z.number().nullable().optional(),
	status: z.string(),
	salesStatus: z.string()
});

export type SearchHit = z.infer<typeof searchHitSchema>;

/**
 * Facet value with count.
 */
export const facetValueSchema = z.object({
	value: z.string(),
	count: z.number()
});

/**
 * Facet counts.
 */
export const facetsSchema = z.object({
	district: z.array(facetValueSchema).optional(),
	salesStatus: z.array(facetValueSchema).optional(),
	status: z.array(facetValueSchema).optional()
});

export type Facets = z.infer<typeof facetsSchema>;

/**
 * Search response schema.
 */
export const searchResponseSchema = z.object({
	hits: z.array(searchHitSchema),
	found: z.number(),
	page: z.number(),
	perPage: z.number(),
	totalPages: z.number(),
	facets: facetsSchema.optional()
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;
