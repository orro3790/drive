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

	const startedAt = Date.now();
	const includeDebugErrors = process.env.NIGHTLY_CRON_E2E === '1';
	const debugErrors: string[] = [];

	const log = logger.child({ cron: 'close-bid-windows' });
	log.info('Starting bid window closure cron job');

	let processed = 0;
	let resolved = 0;
	let transitioned = 0;
	let closed = 0;
	let errors = 0;

	try {
		const orgRows = await db.select({ id: organizations.id }).from(organizations);

		if (orgRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No expired bid windows to process');
			return json({
				success: true,
				processed,
				resolved,
				transitioned,
				closed,
				errors,
				elapsedMs,
				...(includeDebugErrors ? { debugErrors: debugErrors.slice(0, 10) } : {})
			});
		}

		for (const org of orgRows) {
			const orgLog = log.child({ organizationId: org.id });
			let expiredWindows;

			try {
				expiredWindows = await getExpiredBidWindows(undefined, org.id);
			} catch (err) {
				errors++;
				if (includeDebugErrors) {
					debugErrors.push(`organizationId=${org.id}: ${String(err)}`);
				}
				orgLog.error({ error: err }, 'Failed to load expired bid windows for organization');
				continue;
			}

			if (expiredWindows.length === 0) {
				orgLog.info('No expired bid windows for organization');
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
						orgLog.info(
							{ windowId: window.id, winnerId: result.winnerId, bidCount: result.bidCount },
							'Bid window resolved'
						);
					} else if (result.transitioned) {
						transitioned++;
						orgLog.info({ windowId: window.id }, 'Competitive window transitioned to instant');
					} else if (result.reason === 'no_bids') {
						await db
							.update(bidWindows)
							.set({ status: 'closed' })
							.where(eq(bidWindows.id, window.id));
						closed++;
						orgLog.info({ windowId: window.id, mode: window.mode }, 'Window closed (no bids)');
					} else {
						orgLog.info({ windowId: window.id, reason: result.reason }, 'Bid window not resolved');
					}
				} catch (err) {
					errors++;
					if (includeDebugErrors) {
						debugErrors.push(`windowId=${window.id}: ${String(err)}`);
					}
					orgLog.error({ windowId: window.id, error: err }, 'Failed to process bid window');
				}
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{ processed, resolved, transitioned, closed, errors, elapsedMs },
			'Bid window closure cron completed'
		);

		return json({
			success: true,
			processed,
			resolved,
			transitioned,
			closed,
			errors,
			elapsedMs,
			...(includeDebugErrors ? { debugErrors: debugErrors.slice(0, 10) } : {})
		});
	} catch (err) {
		errors++;
		if (includeDebugErrors) {
			debugErrors.push(`fatal: ${String(err)}`);
		}

		const elapsedMs = Date.now() - startedAt;
		log.error(
			{ processed, resolved, transitioned, closed, errors, elapsedMs, error: err },
			'Bid window closure cron failed'
		);

		return json(
			{
				success: false,
				processed,
				resolved,
				transitioned,
				closed,
				errors,
				elapsedMs,
				...(includeDebugErrors ? { debugErrors: debugErrors.slice(0, 10) } : {})
			},
			{ status: 500 }
		);
	}
};
