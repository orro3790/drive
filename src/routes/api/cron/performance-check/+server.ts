/**
 * Performance Check Cron Job
 *
 * Runs daily at 1:00 AM Toronto time.
 * Recalculates driver metrics and applies flagging rules.
 *
 * @see DRV-qen
 */

import { json } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { updateDriverMetrics } from '$lib/server/services/metrics';
import { checkAndApplyFlag, type FlaggingResult } from '$lib/server/services/flagging';

const BATCH_SIZE = 50;

interface PerformanceCheckSummary {
	driversChecked: number;
	newlyFlagged: number;
	capsReduced: number;
	rewardsGranted: number;
	errors: number;
}

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret to prevent unauthorized access
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	const isAuthorized = !!expectedToken && authHeader === `Bearer ${expectedToken}`;

	if (!isAuthorized) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'performance-check' });
	const startedAt = Date.now();
	log.info('Starting performance check cron job');

	const summary: PerformanceCheckSummary = {
		driversChecked: 0,
		newlyFlagged: 0,
		capsReduced: 0,
		rewardsGranted: 0,
		errors: 0
	};
	try {
		// Get all drivers
		const drivers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'driver'));

		log.info({ driverCount: drivers.length }, 'Found drivers to process');

		// Process in batches to avoid timeout
		for (let i = 0; i < drivers.length; i += BATCH_SIZE) {
			const batch = drivers.slice(i, i + BATCH_SIZE);
			const batchResults = await Promise.allSettled(
				batch.map(async (driver) => {
					// Update metrics first
					await updateDriverMetrics(driver.id);
					// Then apply flagging logic
					return await checkAndApplyFlag(driver.id);
				})
			);

			for (const [index, result] of batchResults.entries()) {
				const driverId = batch[index]?.id ?? 'unknown';
				if (result.status === 'fulfilled' && result.value) {
					const flagResult: FlaggingResult = result.value;
					summary.driversChecked++;

					if (flagResult.warningSent) {
						summary.newlyFlagged++;
					}
					if (flagResult.gracePenaltyApplied) {
						summary.capsReduced++;
					}
					if (flagResult.rewardApplied) {
						summary.rewardsGranted++;
					}
				} else if (result.status === 'rejected') {
					summary.errors++;
					log.error({ error: result.reason, userId: driverId }, 'Error processing driver');
				}
			}

			log.debug(
				{ batch: Math.floor(i / BATCH_SIZE) + 1, processed: i + batch.length },
				'Batch processed'
			);
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{
				...summary,
				elapsedMs,
				driverCount: drivers.length
			},
			'Performance check cron job completed'
		);

		return json({
			success: true,
			summary,
			elapsedMs
		});
	} catch (error) {
		log.error({ error }, 'Performance check cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
