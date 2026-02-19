/**
 * Shared cron authentication utility.
 *
 * Verifies the Bearer token in the Authorization header against CRON_SECRET.
 */

import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

export function verifyCronAuth(request: Request) {
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}
	return null;
}
