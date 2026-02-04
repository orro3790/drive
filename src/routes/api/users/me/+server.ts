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
import { userProfileUpdateSchema } from '$lib/schemas/user-settings';

export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = userProfileUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const userId = locals.user.id;
	const now = new Date();
	const normalizedEmail = result.data.email.trim().toLowerCase();
	const normalizedName = result.data.name.trim();
	const normalizedPhone = result.data.phone ? result.data.phone.trim() : null;

	let updatedUser:
		| {
				id: string;
				name: string;
				email: string;
				phone: string | null;
				role: string;
		  }
		| null = null;

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

			if (normalizedEmail !== locals.user.email.toLowerCase()) {
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
			err && typeof err === 'object' && 'code' in err
				? (err as { code?: string }).code
				: undefined;
		if (errorCode === '23505') {
			return json({ error: 'email_taken' }, { status: 409 });
		}
		throw error(500, 'Failed to update profile');
	}

	if (!updatedUser) {
		throw error(404, 'User not found');
	}

	return json({ user: updatedUser });
};
