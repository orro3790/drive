/**
 * User Profile API
 *
 * PATCH /api/users/me - Update current user's profile
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { account } from '$lib/server/db/auth-schema';
import logger, { toSafeErrorMessage } from '$lib/server/logger';
import { requireAuthenticatedWithOrg } from '$lib/server/org-scope';
import { userProfileUpdateSchema } from '$lib/schemas/user-settings';

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const requestId = locals.requestId ?? null;

	if (!locals.user) {
		logger.warn(
			{
				event: 'user.profile.update.rejected',
				errorCode: 'USER_PROFILE_UNAUTHORIZED',
				requestId,
				userId: null
			},
			'Unauthorized profile update attempt'
		);
		throw error(401, 'Unauthorized');
	}

	const { user: currentUser } = requireAuthenticatedWithOrg(locals);
	const log = logger.child({
		event: 'user.profile.update',
		requestId,
		userId: currentUser.id
	});

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		log.warn(
			{
				errorCode: 'USER_PROFILE_INVALID_JSON'
			},
			'Profile update rejected due to invalid JSON body'
		);
		throw error(400, 'Invalid JSON body');
	}

	const result = userProfileUpdateSchema.safeParse(body);

	if (!result.success) {
		log.warn(
			{
				errorCode: 'USER_PROFILE_VALIDATION_FAILED',
				issueCount: result.error.issues.length
			},
			'Profile update validation failed'
		);
		throw error(400, 'Validation failed');
	}

	const userId = currentUser.id;
	const now = new Date();
	const normalizedEmail = result.data.email.trim().toLowerCase();
	const normalizedName = result.data.name.trim();
	const normalizedPhone = result.data.phone ? result.data.phone.trim() : null;

	let updatedUser: {
		id: string;
		name: string;
		email: string;
		phone: string | null;
		role: string;
	} | null = null;

	try {
		updatedUser = await db.transaction(async (tx) => {
			const [updated] = await tx
				.update(user)
				.set({
					name: normalizedName,
					email: normalizedEmail,
					phone: normalizedPhone,
					updatedAt: now
				})
				.where(eq(user.id, userId))
				.returning({
					id: user.id,
					name: user.name,
					email: user.email,
					phone: user.phone,
					role: user.role
				});

			if (!updated) {
				return null;
			}

			if (normalizedEmail !== currentUser.email.toLowerCase()) {
				await tx
					.update(account)
					.set({
						accountId: normalizedEmail,
						updatedAt: now
					})
					.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
			}

			return updated;
		});
	} catch (err) {
		const errorCode =
			err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
		if (errorCode === '23505') {
			log.warn(
				{
					errorCode: 'USER_PROFILE_EMAIL_CONFLICT'
				},
				'Profile update rejected due to duplicate email'
			);
			return json({ error: 'email_taken' }, { status: 409 });
		}

		log.error(
			{
				errorCode: 'USER_PROFILE_DB_TRANSACTION_FAILED',
				errorType: toSafeErrorMessage(err)
			},
			'Profile update failed during database transaction'
		);
		throw error(500, 'Failed to update profile');
	}

	if (!updatedUser) {
		log.warn(
			{
				errorCode: 'USER_PROFILE_USER_NOT_FOUND'
			},
			'Profile update failed because user record was missing'
		);
		throw error(404, 'User not found');
	}

	log.info({ outcomeCode: 'USER_PROFILE_UPDATED' }, 'Profile update succeeded');

	return json({ user: updatedUser });
};
