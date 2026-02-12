/**
 * Notifications API
 *
 * PATCH /api/notifications/[id]/read - Mark notification as read
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import {
	notificationIdSchema,
	notificationMarkReadResponseSchema
} from '$lib/schemas/api/notifications';
import { requireAuthenticatedWithOrg } from '$lib/server/org-scope';

export const PATCH: RequestHandler = async ({ locals, params }) => {
	const { user } = requireAuthenticatedWithOrg(locals);

	const paramsResult = notificationIdSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid notification id');
	}

	const { id } = paramsResult.data;

	const [updated] = await db
		.update(notifications)
		.set({ read: true })
		.where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
		.returning({ id: notifications.id });

	if (!updated) {
		throw error(404, 'Notification not found');
	}

	return json(notificationMarkReadResponseSchema.parse({ success: true }));
};
