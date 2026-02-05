/**
 * Notifications API
 *
 * POST /api/notifications/mark-all-read - Mark all notifications as read
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { notificationMarkAllReadResponseSchema } from '$lib/schemas/api/notifications';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const updated = await db
		.update(notifications)
		.set({ read: true })
		.where(and(eq(notifications.userId, locals.user.id), eq(notifications.read, false)))
		.returning({ id: notifications.id });

	return json(
		notificationMarkAllReadResponseSchema.parse({
			success: true,
			updatedCount: updated.length
		})
	);
};
