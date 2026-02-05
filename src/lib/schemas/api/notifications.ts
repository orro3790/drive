/**
 * Notification API schemas
 */

import { z } from 'zod';

export const notificationTypeValues = [
	'shift_reminder',
	'bid_open',
	'bid_won',
	'bid_lost',
	'shift_cancelled',
	'warning',
	'manual',
	'schedule_locked',
	'assignment_confirmed',
	'route_unfilled',
	'route_cancelled',
	'driver_no_show'
] as const;

export const notificationTypeSchema = z.enum(notificationTypeValues);

export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationSchema = z.object({
	id: z.string().uuid(),
	type: notificationTypeSchema,
	title: z.string(),
	body: z.string(),
	data: z.record(z.string(), z.string()).nullable(),
	read: z.boolean(),
	createdAt: z.string().datetime()
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationListParamsSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(50).default(20)
});

export const notificationListResponseSchema = z.object({
	notifications: z.array(notificationSchema),
	unreadCount: z.number().int().min(0),
	pagination: z.object({
		page: z.number().int().min(1),
		pageSize: z.number().int().min(1),
		total: z.number().int().min(0),
		totalPages: z.number().int().min(1)
	})
});

export const notificationIdSchema = z.object({
	id: z.string().uuid()
});

export const notificationMarkReadResponseSchema = z.object({
	success: z.boolean()
});

export const notificationMarkAllReadResponseSchema = z.object({
	success: z.boolean(),
	updatedCount: z.number().int().min(0)
});
