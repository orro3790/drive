/**
 * Close Bid Windows Cron Job
 *
 * Scheduled: Daily at midnight UTC (0 0 * * *)
 * Note: Vercel Hobby plan limits cron to once daily. Upgrade to Pro for
 * more frequent execution (e.g., every 15 minutes for faster bid resolution).
 *
 * Finds expired bid windows and resolves them via resolveBidWindow().
 * Windows without bids remain open (per spec: stays open indefinitely).
 * Each window is processed independently - errors don't block others.
 *
 * @see DRV-5eo
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import logger from '$lib/server/logger';
import {
	getExpiredBidWindows,
	resolveBidWindow,
	type ResolveBidWindowResult
} from '$lib/server/services/bidding';

interface ProcessingResult {
	windowId: string;
	result: ResolveBidWindowResult | { error: string };
}

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret to prevent unauthorized access
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'close-bid-windows' });
	log.info('Starting bid window closure cron job');

	const expiredWindows = await getExpiredBidWindows();

	if (expiredWindows.length === 0) {
		log.info('No expired bid windows to process');
		return json({ success: true, processed: 0, resolved: 0, errors: 0 });
	}

	log.info({ count: expiredWindows.length }, 'Found expired bid windows');

	const results: ProcessingResult[] = [];
	let resolvedCount = 0;
	let errorCount = 0;

	// Process each window independently
	for (const window of expiredWindows) {
		try {
			const result = await resolveBidWindow(window.id);
			results.push({ windowId: window.id, result });

			if (result.resolved) {
				resolvedCount++;
				log.info(
					{ windowId: window.id, winnerId: result.winnerId, bidCount: result.bidCount },
					'Bid window resolved'
				);
			} else {
				// Window stayed open (no bids or already resolved)
				log.info({ windowId: window.id, reason: result.reason }, 'Bid window not resolved');
			}
		} catch (error) {
			errorCount++;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			results.push({ windowId: window.id, result: { error: errorMessage } });
			log.error({ windowId: window.id, error: errorMessage }, 'Failed to process bid window');
		}
	}

	log.info(
		{ processed: expiredWindows.length, resolved: resolvedCount, errors: errorCount },
		'Bid window closure cron job completed'
	);

	return json({
		success: true,
		processed: expiredWindows.length,
		resolved: resolvedCount,
		errors: errorCount,
		results
	});
};
