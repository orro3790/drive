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
import { and, eq, ne } from 'drizzle-orm';
import logger, { toSafeErrorMessage } from '$lib/server/logger';
import { requireAuthenticatedWithOrg } from '$lib/server/org-scope';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user: authedUser } = requireAuthenticatedWithOrg(locals);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = fcmTokenSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Invalid token format');
	}

	const { token } = result.data;
	const log = logger.child({ operation: 'registerFcmToken' });

	try {
		// A device token can only belong to one account at a time.
		// Clear any stale links first (e.g. after account switching on the same device).
		await db
			.update(user)
			.set({
				fcmToken: null,
				updatedAt: new Date()
			})
			.where(and(eq(user.fcmToken, token), ne(user.id, authedUser.id)));

		await db
			.update(user)
			.set({
				fcmToken: token,
				updatedAt: new Date()
			})
			.where(eq(user.id, authedUser.id));

		log.info('FCM token registered');

		return json({ success: true });
	} catch (err) {
		log.error({ errorMessage: toSafeErrorMessage(err) }, 'Failed to register FCM token');
		throw error(500, 'Failed to register token');
	}
};

/**
 * DELETE /api/users/fcm-token - Remove user's FCM token
 */
export const DELETE: RequestHandler = async ({ locals }) => {
	const { user: authedUser } = requireAuthenticatedWithOrg(locals);

	const log = logger.child({ operation: 'unregisterFcmToken' });

	try {
		await db
			.update(user)
			.set({
				fcmToken: null,
				updatedAt: new Date()
			})
			.where(eq(user.id, authedUser.id));

		log.info('FCM token removed');

		return json({ success: true });
	} catch (err) {
		log.error({ errorMessage: toSafeErrorMessage(err) }, 'Failed to remove FCM token');
		throw error(500, 'Failed to remove token');
	}
};
