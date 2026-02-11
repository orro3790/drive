/**
 * No-Show Detection Cron Job
 *
 * Runs daily after shift start time to detect no-shows.
 * Creates bid windows and alerts managers.
 *
 * @see DRV-xtb
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';
import { detectNoShows } from '$lib/server/services/noshow';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'no-show-detection' });
	const startedAt = Date.now();
	log.info('Starting no-show detection cron job');

	try {
		const result = await detectNoShows();
		const elapsedMs = Date.now() - startedAt;

		log.info(
			{
				...result,
				elapsedMs
			},
			'No-show detection cron job completed'
		);

		return json({
			success: true,
			...result,
			elapsedMs
		});
	} catch (error) {
		log.error({ error }, 'No-show detection cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
