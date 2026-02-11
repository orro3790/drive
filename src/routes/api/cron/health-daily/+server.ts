/**
 * Daily Health Evaluation Cron Job
 *
 * Computes daily health scores for all active drivers,
 * persists snapshots, and sends corrective warnings.
 *
 * Recommended schedule: daily at 2:00 AM Toronto time (after performance-check).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';
import { runDailyHealthEvaluation } from '$lib/server/services/health';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'health-daily' });
	log.info('Starting daily health evaluation');

	try {
		const result = await runDailyHealthEvaluation();

		log.info(result, 'Daily health evaluation completed');

		return json({
			success: true,
			summary: result
		});
	} catch (error) {
		log.error({ error }, 'Daily health evaluation failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
