/**
 * Lock Preferences Cron Job
 *
 * Runs Sunday 23:59 Toronto time.
 * Locks driver preferences for the upcoming schedule generation.
 *
 * @see DRV-e30
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret to prevent unauthorized access
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'lock-preferences' });
	log.info('Starting preference lock cron job');

	try {
		// TODO: Implement preference locking logic
		// 1. Update all driverPreferences.lockedAt to now
		// 2. Trigger schedule generation for next week

		log.info('Preference lock cron job completed');
		return json({ success: true });
	} catch (error) {
		log.error({ error }, 'Preference lock cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
