/**
 * Admin Password Reset - Server Actions
 *
 * Allows managers to reset any user's password directly.
 */

import { fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as authSchema from '$lib/server/db/auth-schema';
import logger from '$lib/server/logger';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import type { Actions } from './$types';

async function readAuthErrorMessage(response: Response): Promise<string | null> {
	const payload = await response
		.clone()
		.json()
		.catch(() => null);

	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const message = (payload as { message?: unknown }).message;
	return typeof message === 'string' ? message : null;
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const { user: manager, organizationId } = requireManagerWithOrg(locals);

		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim().toLowerCase();
		const newPassword = formData.get('newPassword')?.toString();
		const confirmPassword = formData.get('confirmPassword')?.toString();

		// Validation
		if (!email) {
			return fail(400, {
				errorCode: 'admin_reset_password_error_email_required',
				email
			});
		}

		if (!newPassword || newPassword.length < 8) {
			return fail(400, {
				errorCode: 'admin_reset_password_error_password_short',
				email
			});
		}

		if (newPassword !== confirmPassword) {
			return fail(400, {
				errorCode: 'admin_reset_password_error_password_mismatch',
				email
			});
		}

		try {
			// Find the user by email within the same org
			const [targetUser] = await db
				.select()
				.from(authSchema.user)
				.where(
					and(eq(authSchema.user.email, email), eq(authSchema.user.organizationId, organizationId))
				)
				.limit(1);

			if (!targetUser) {
				return fail(404, {
					errorCode: 'admin_reset_password_error_user_not_found',
					email
				});
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
					errorCode: 'admin_reset_password_error_no_password_account',
					email
				});
			}

			const authResponse = await auth.api.setUserPassword({
				headers: request.headers,
				body: {
					newPassword,
					userId: targetUser.id
				},
				asResponse: true
			});

			if (!authResponse.ok) {
				if (authResponse.status === 401 || authResponse.status === 403) {
					return fail(403, {
						errorCode: 'admin_reset_password_error_access_denied',
						email
					});
				}

				const authMessage = await readAuthErrorMessage(authResponse);
				if (authMessage === 'PASSWORD_TOO_SHORT') {
					return fail(400, {
						errorCode: 'admin_reset_password_error_password_short',
						email
					});
				}

				if (authMessage === 'PASSWORD_TOO_LONG') {
					return fail(400, {
						errorCode: 'admin_reset_password_error_password_long',
						email
					});
				}

				logger.error(
					{
						targetEmail: email,
						adminEmail: manager.email,
						status: authResponse.status,
						authMessage
					},
					'Admin password reset failed via Better Auth'
				);

				return fail(500, {
					errorCode: 'admin_reset_password_error_reset_failed',
					email
				});
			}

			logger.info(
				{ targetEmail: email, adminEmail: manager.email },
				'Admin password reset completed'
			);

			return { success: true, email };
		} catch (err) {
			logger.error(
				{ email, error: err instanceof Error ? err.message : 'unknown' },
				'Admin password reset failed'
			);
			return fail(500, {
				errorCode: 'admin_reset_password_error_reset_failed',
				email
			});
		}
	}
};
