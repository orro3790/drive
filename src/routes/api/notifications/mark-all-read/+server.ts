/**
 * Notifications API
 *
 * POST /api/notifications/mark-all-read - Mark all notifications as read
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notifications } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { notificationMarkAllReadResponseSchema } from '$lib/schemas/api/notifications';
import { requireAuthenticatedWithOrg } from '$lib/server/org-scope';

export const POST: RequestHandler = async ({ locals }) => {
	const { user } = requireAuthenticatedWithOrg(locals);

	const updated = await db
		.update(notifications)
		.set({ read: true })
		.where(and(eq(notifications.userId, user.id), eq(notifications.read, false)))
		.returning({ id: notifications.id });

	return json(
		notificationMarkAllReadResponseSchema.parse({
			success: true,
			updatedCount: updated.length
		})
	);
};
