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
import { db } from '$lib/server/db';
import { organizations } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { runDailyHealthEvaluation } from '$lib/server/services/health';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'health-daily' });
	const startedAt = Date.now();
	log.info('Starting daily health evaluation');

	try {
		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for daily health evaluation');
			return json({
				success: true,
				summary: {
					evaluated: 0,
					scored: 0,
					skippedNewDrivers: 0,
					correctiveWarnings: 0,
					errors: 0,
					elapsedMs
				}
			});
		}

		const aggregate = {
			evaluated: 0,
			scored: 0,
			skippedNewDrivers: 0,
			correctiveWarnings: 0,
			errors: 0
		};

		for (const organization of organizationRows) {
			const orgLog = log.child({ organizationId: organization.id });
			const result = await runDailyHealthEvaluation(organization.id);

			aggregate.evaluated += result.evaluated;
			aggregate.scored += result.scored;
			aggregate.skippedNewDrivers += result.skippedNewDrivers;
			aggregate.correctiveWarnings += result.correctiveWarnings;
			aggregate.errors += result.errors;

			orgLog.info(result, 'Daily health evaluation completed for organization');
		}

		const elapsedMs = Date.now() - startedAt;
		const result = {
			...aggregate,
			elapsedMs
		};

		log.info(result, 'Daily health evaluation completed');

		return json({
			success: true,
			summary: result
		});
	} catch (error) {
		log.error({ error }, 'Daily health evaluation failed');
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
