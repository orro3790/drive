/**
 * Zod schemas for academy bounds API.
 *
 * Used by /api/academies/bounds endpoint for map-based queries.
 */

import { z } from 'zod';

/**
 * Bounding box with lat/lng validation.
 */
export const bboxSchema = z
	.object({
		north: z.number().min(-90).max(90),
		south: z.number().min(-90).max(90),
		east: z.number().min(-180).max(180),
		west: z.number().min(-180).max(180)
	})
	.refine((data) => data.north > data.south, {
		message: 'North must be greater than south'
	})
	.refine(
		(data) => {
			const latDiff = data.north - data.south;
			const lngDiff =
				data.east >= data.west ? data.east - data.west : 180 - data.west + (data.east + 180);
			return latDiff <= 0.5 && lngDiff <= 0.5;
		},
		{ message: 'Bounding box too large (max ~55km)' }
	);

/**
 * Bounds request filters.
 */
export const boundsFiltersSchema = z
	.object({
		district: z.string().optional(),
		salesStatus: z.string().optional(),
		status: z.string().optional(),
		contacted: z.boolean().optional()
	})
	.optional();

/**
 * Bounds request schema.
 */
export const boundsRequestSchema = z.object({
	bbox: bboxSchema,
	filters: boundsFiltersSchema,
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(500).default(100)
});

export type BoundsRequest = z.infer<typeof boundsRequestSchema>;

/**
 * Single bounds hit (queue-safe fields for map markers).
 */
export const boundsHitSchema = z.object({
	id: z.string(),
	sourceName: z.string(),
	sourceDistrict: z.string(),
	sourceStatusNormalized: z.string(),
	salesStatus: z.string(),
	targetMatchConfidence: z.enum(['high', 'low', 'none']),
	salesSnoozeUntil: z.string().nullable(),
	lat: z.number(),
	lng: z.number()
});

export type BoundsHit = z.infer<typeof boundsHitSchema>;

/**
 * Bounds response schema.
 */
export const boundsResponseSchema = z.object({
	hits: z.array(boundsHitSchema),
	count: z.number(),
	page: z.number(),
	limit: z.number()
});

export type BoundsResponse = z.infer<typeof boundsResponseSchema>;
