/**
 * Zod schemas for queue API.
 *
 * Used by /api/queue/next-calls endpoint.
 */

import { z } from 'zod';

/**
 * Single queue entry for the next-call list.
 */
export const queueEntrySchema = z.object({
	id: z.string(),
	sourceName: z.string(),
	sourceDistrict: z.string(),
	salesStatus: z.string(),
	salesInterestLevel: z.string().nullable(),
	sourceCapacityTotal: z.number().nullable(),
	primaryContactPhone: z.string().nullable(),
	hasDueFollowUp: z.boolean(),
	isPinned: z.boolean()
});

export type QueueEntry = z.infer<typeof queueEntrySchema>;

/**
 * Queue response schema.
 */
export const queueResponseSchema = z.object({
	data: z.array(queueEntrySchema)
});

export type QueueResponse = z.infer<typeof queueResponseSchema>;

/**
 * Snooze reason values for UI display.
 */
export const snoozeReasonValues = [
	'no_phone',
	'requested_later',
	'already_contacted',
	'not_a_fit',
	'other'
] as const;

export type SnoozeReason = (typeof snoozeReasonValues)[number];

/**
 * Skip request schema (for POST /api/queue/next-calls).
 */
export const skipRequestSchema = z
	.object({
		academyId: z.string().uuid(),
		reason: z.enum(snoozeReasonValues),
		snoozeUntil: z.coerce.date().optional()
	})
	.refine(
		(data) => {
			if (data.snoozeUntil && data.snoozeUntil <= new Date()) {
				return false;
			}
			return true;
		},
		{
			message: 'Snooze date must be in the future',
			path: ['snoozeUntil']
		}
	)
	.refine(
		(data) => {
			if (data.snoozeUntil) {
				const oneYearFromNow = new Date();
				oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
				return data.snoozeUntil <= oneYearFromNow;
			}
			return true;
		},
		{
			message: 'Snooze date must be within 1 year',
			path: ['snoozeUntil']
		}
	);

export type SkipRequest = z.infer<typeof skipRequestSchema>;
