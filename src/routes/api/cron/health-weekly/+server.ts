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
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';
import { runWeeklyHealthEvaluation } from '$lib/server/services/health';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

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
