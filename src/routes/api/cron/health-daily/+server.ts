/**
 * Daily Health Evaluation Cron Job
 *
 * Computes daily health scores for all active drivers,
 * persists snapshots, and sends corrective warnings.
 *
 * Recommended schedule: daily at 2:00 AM Toronto time (after performance-check).
 */

import { json } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';
import { runDailyHealthEvaluation } from '$lib/server/services/health';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	const isAuthorized = !!expectedToken && authHeader === `Bearer ${expectedToken}`;

	if (!isAuthorized) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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
