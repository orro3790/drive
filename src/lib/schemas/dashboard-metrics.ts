import { z } from 'zod';
import { callObjectionValues, callPainPointValues } from '$lib/schemas/call-log';

export const dashboardPipelineSchema = z.object({
	not_contacted: z.number().int().nonnegative(),
	attempted: z.number().int().nonnegative(),
	contacted: z.number().int().nonnegative(),
	warm: z.number().int().nonnegative(),
	hot: z.number().int().nonnegative(),
	customer: z.number().int().nonnegative(),
	lost: z.number().int().nonnegative()
});

export const dashboardCallOutcomeSchema = z.object({
	no_answer: z.number().int().nonnegative(),
	gatekeeper: z.number().int().nonnegative(),
	decision_maker: z.number().int().nonnegative(),
	refused: z.number().int().nonnegative(),
	interested: z.number().int().nonnegative(),
	not_interested: z.number().int().nonnegative()
});

export const dashboardObjectionCountSchema = z.object({
	objection: z.enum(callObjectionValues),
	count: z.number().int().nonnegative()
});

export const dashboardPainPointCountSchema = z.object({
	painPoint: z.enum(callPainPointValues),
	count: z.number().int().nonnegative()
});

export const dashboardContactRateSchema = z.object({
	contacted: z.number().int().nonnegative(),
	called: z.number().int().nonnegative(),
	rate: z.number().nonnegative().max(1)
});

export const dashboardRevenueSchema = z.object({
	seatsSold: z.number().int().nonnegative(),
	mrr: z.number().int().nonnegative(),
	arr: z.number().int().nonnegative()
});

export const dashboardMetricsSchema = z.object({
	englishAcademies: z.number().int().nonnegative(),
	priorityTargets: z.number().int().nonnegative(),
	callsToday: z.number().int().nonnegative(),
	conversions: z.number().int().nonnegative(),
	followUpsDue: z.number().int().nonnegative(),
	pipeline: dashboardPipelineSchema,
	callOutcomes: dashboardCallOutcomeSchema,
	topObjections: z.array(dashboardObjectionCountSchema),
	painPoints: z.array(dashboardPainPointCountSchema),
	contactRate: dashboardContactRateSchema,
	revenue: dashboardRevenueSchema
});

export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>;
