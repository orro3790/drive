/**
 * User Password API
 *
 * POST /api/users/password - Change current user's password
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { mapChangePasswordFailure } from '$lib/server/password-change-error-mapping';
import { userPasswordUpdateSchema } from '$lib/schemas/user-settings';

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

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => null);
	const result = userPasswordUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { currentPassword, newPassword } = result.data;

	const authResponse = await auth.api.changePassword({
		headers: request.headers,
		body: {
			currentPassword,
			newPassword
		},
		asResponse: true
	});

	if (authResponse.ok) {
		return json({ success: true });
	}

	const authMessage = await readAuthErrorMessage(authResponse);
	const mappedFailure = mapChangePasswordFailure(authMessage, authResponse.status);

	return json({ error: mappedFailure.error }, { status: mappedFailure.status });
};
