/**
 * Performance Check Cron Job
 *
 * Runs daily at 01:00 UTC (configured in .github/workflows/cron-jobs.yml).
 * Recalculates driver metrics and applies flagging rules.
 *
 * @see DRV-qen
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { organizations, user } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { updateDriverMetrics } from '$lib/server/services/metrics';
import { checkAndApplyFlag, type FlaggingResult } from '$lib/server/services/flagging';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { verifyCronAuth } from '$lib/server/cron/auth';

interface PerformanceCheckSummary {
	driversChecked: number;
	newlyFlagged: number;
	capsReduced: number;
	rewardsGranted: number;
	errors: number;
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

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
		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ ...summary, elapsedMs }, 'No organizations found for performance check');
			return json({
				success: true,
				summary,
				elapsedMs
			});
		}

		let driverCount = 0;

		for (const organization of organizationRows) {
			const orgLog = log.child({ organizationId: organization.id });

			// Get all drivers for this organization
			const drivers = await db
				.select({ id: user.id })
				.from(user)
				.where(and(eq(user.role, 'driver'), eq(user.organizationId, organization.id)));

			driverCount += drivers.length;
			orgLog.info({ driverCount: drivers.length }, 'Found drivers to process');

			// Process in batches to avoid timeout
			for (let i = 0; i < drivers.length; i += dispatchPolicy.jobs.performanceCheckBatchSize) {
				const batch = drivers.slice(i, i + dispatchPolicy.jobs.performanceCheckBatchSize);
				const batchResults = await Promise.allSettled(
					batch.map(async (driver) => {
						// Update metrics first
						await updateDriverMetrics(driver.id, organization.id);
						// Then apply flagging logic
						return await checkAndApplyFlag(driver.id, organization.id);
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
						orgLog.error({ error: result.reason, userId: driverId }, 'Error processing driver');
					}
				}

				orgLog.debug(
					{
						batch: Math.floor(i / dispatchPolicy.jobs.performanceCheckBatchSize) + 1,
						processed: i + batch.length
					},
					'Batch processed'
				);
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{
				...summary,
				elapsedMs,
				driverCount
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
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
