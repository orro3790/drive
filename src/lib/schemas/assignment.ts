/**
 * Assignment Schemas
 *
 * Source of truth for assignment-related types and cancellation inputs.
 */

import { z } from 'zod';

export const assignmentStatusSchema = z.enum([
	'scheduled',
	'active',
	'completed',
	'cancelled',
	'unfilled'
]);

export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

export const cancelReasonValues = [
	'vehicle_breakdown',
	'medical_emergency',
	'family_emergency',
	'traffic_accident',
	'weather_conditions',
	'personal_emergency',
	'other'
] as const;

export const cancelReasonSchema = z.enum(cancelReasonValues);

export type CancelReason = z.infer<typeof cancelReasonSchema>;

export const assignmentCancelSchema = z.object({
	reason: cancelReasonSchema
});

export type AssignmentCancelInput = z.infer<typeof assignmentCancelSchema>;
