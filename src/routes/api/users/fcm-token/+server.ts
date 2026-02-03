/**
 * FCM Token Registration API
 *
 * POST /api/users/fcm-token - Register or update user's FCM token
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { fcmTokenSchema } from '$lib/schemas/fcm-token';
import { eq } from 'drizzle-orm';
import logger from '$lib/server/logger';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = fcmTokenSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Invalid token format');
	}

	const { token } = result.data;
	const log = logger.child({ operation: 'registerFcmToken', userId: locals.user.id });

	try {
		await db
			.update(user)
			.set({
				fcmToken: token,
				updatedAt: new Date()
			})
			.where(eq(user.id, locals.user.id));

		log.info('FCM token registered');

		return json({ success: true });
	} catch (err) {
		log.error({ error: err }, 'Failed to register FCM token');
		throw error(500, 'Failed to register token');
	}
};

/**
 * DELETE /api/users/fcm-token - Remove user's FCM token
 */
export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const log = logger.child({ operation: 'unregisterFcmToken', userId: locals.user.id });

	try {
		await db
			.update(user)
			.set({
				fcmToken: null,
				updatedAt: new Date()
			})
			.where(eq(user.id, locals.user.id));

		log.info('FCM token removed');

		return json({ success: true });
	} catch (err) {
		log.error({ error: err }, 'Failed to remove FCM token');
		throw error(500, 'Failed to remove token');
	}
};
