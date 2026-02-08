/**
 * Weekly Health Evaluation Cron Job
 *
 * Evaluates the just-completed week for all active drivers:
 * qualifying-week check, star progression, hard-stop resets,
 * and milestone/reset notifications.
 *
 * Recommended schedule: Monday at 3:00 AM Toronto time.
 */

import { json } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';
import { runWeeklyHealthEvaluation } from '$lib/server/services/health';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	const isAuthorized = !!expectedToken && authHeader === `Bearer ${expectedToken}`;

	if (!isAuthorized) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'health-weekly' });
	log.info('Starting weekly health evaluation');

	try {
		const result = await runWeeklyHealthEvaluation();

		log.info(result, 'Weekly health evaluation completed');

		return json({
			success: true,
			summary: result
		});
	} catch (error) {
		log.error({ error }, 'Weekly health evaluation failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
