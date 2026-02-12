// Close Bid Windows Cron Job
//
// Scheduled: Every 15 minutes
//
// Handles expired bid windows by mode:
// - Competitive with bids: scored resolution (pick winner)
// - Competitive without bids: transition to instant mode
// - Instant/emergency past closesAt: close window, alert manager

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bidWindows, organizations } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { getExpiredBidWindows, resolveBidWindow } from '$lib/server/services/bidding';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'close-bid-windows' });
	log.info('Starting bid window closure cron job');

	const orgRows = await db.select({ id: organizations.id }).from(organizations);

	if (orgRows.length === 0) {
		log.info('No expired bid windows to process');
		return json({
			success: true,
			processed: 0,
			resolved: 0,
			transitioned: 0,
			closed: 0,
			errors: 0
		});
	}

	let processed = 0;
	let resolved = 0;
	let transitioned = 0;
	let closed = 0;
	let errors = 0;

	for (const org of orgRows) {
		const expiredWindows = await getExpiredBidWindows(undefined, org.id);
		if (expiredWindows.length === 0) {
			continue;
		}

		processed += expiredWindows.length;

		for (const window of expiredWindows) {
			try {
				const result = await resolveBidWindow(
					window.id,
					{ actorType: 'system', actorId: null },
					org.id
				);

				if (result.resolved) {
					resolved++;
					log.info(
						{ windowId: window.id, winnerId: result.winnerId, bidCount: result.bidCount },
						'Bid window resolved'
					);
				} else if (result.transitioned) {
					transitioned++;
					log.info({ windowId: window.id }, 'Competitive window transitioned to instant');
				} else if (result.reason === 'no_bids') {
					// Instant/emergency window with no bids — close it
					await db.update(bidWindows).set({ status: 'closed' }).where(eq(bidWindows.id, window.id));
					closed++;
					log.info({ windowId: window.id, mode: window.mode }, 'Window closed (no bids)');
				} else {
					log.info({ windowId: window.id, reason: result.reason }, 'Bid window not resolved');
				}
			} catch (err) {
				errors++;
				log.error({ windowId: window.id, error: err }, 'Failed to process bid window');
			}
		}
	}

	log.info(
		{ processed, resolved, transitioned, closed, errors },
		'Bid window closure cron completed'
	);

	return json({
		success: true,
		processed,
		resolved,
		transitioned,
		closed,
		errors
	});
};
