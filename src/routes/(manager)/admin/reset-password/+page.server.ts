/**
 * Admin Password Reset - Server Actions
 *
 * Allows managers to reset any user's password directly.
 * NOTE: This is a workaround until email-based password reset is enabled.
 */

import { fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import { db } from '$lib/server/db';
import * as authSchema from '$lib/server/db/auth-schema';
import logger from '$lib/server/logger';
import type { Actions } from './$types';

const scryptAsync = promisify(scrypt);

/**
 * Hash password using scrypt (matching Better Auth's default implementation)
 */
async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
	return `${salt}:${derivedKey.toString('hex')}`;
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		// Double-check manager role (layout already checks, but be safe)
		if (!locals.user || locals.user.role !== 'manager') {
			return fail(403, { error: 'Access denied' });
		}

		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase();
		const newPassword = formData.get('newPassword')?.toString();
		const confirmPassword = formData.get('confirmPassword')?.toString();

		// Validation
		if (!email) {
			return fail(400, { error: 'Email is required', email });
		}

		if (!newPassword || newPassword.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters', email });
		}

		if (newPassword !== confirmPassword) {
			return fail(400, { error: 'Passwords do not match', email });
		}

		try {
			// Find the user by email (using select instead of query builder)
			const [targetUser] = await db
				.select()
				.from(authSchema.user)
				.where(eq(authSchema.user.email, email))
				.limit(1);

			if (!targetUser) {
				return fail(404, { error: 'No user found with that email', email });
			}

			// Find their credential account
			const [credentialAccount] = await db
				.select()
				.from(authSchema.account)
				.where(
					and(
						eq(authSchema.account.userId, targetUser.id),
						eq(authSchema.account.providerId, 'credential')
					)
				)
				.limit(1);

			if (!credentialAccount) {
				return fail(400, {
					error: 'User does not have a password-based account (may use OAuth)',
					email
				});
			}

			// Hash the new password
			const hashedPassword = await hashPassword(newPassword);

			// Update the password
			await db
				.update(authSchema.account)
				.set({
					password: hashedPassword,
					updatedAt: new Date()
				})
				.where(eq(authSchema.account.id, credentialAccount.id));

			logger.info(
				{ targetEmail: email, adminEmail: locals.user.email },
				'Admin password reset completed'
			);

			return { success: true, email };
		} catch (err) {
			logger.error(
				{ email, error: err instanceof Error ? err.message : 'unknown' },
				'Admin password reset failed'
			);
			return fail(500, { error: 'Failed to reset password. Please try again.', email });
		}
	}
};
