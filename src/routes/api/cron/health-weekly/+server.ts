/**
 * Weekly Health Evaluation Cron Job
 *
 * Evaluates the just-completed week for all active drivers:
 * qualifying-week check, star progression, hard-stop resets,
 * and milestone/reset notifications.
 *
 * Recommended schedule: Monday at 3:00 AM Toronto time.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { organizations } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { runWeeklyHealthEvaluation } from '$lib/server/services/health';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'health-weekly' });
	const startedAt = Date.now();
	log.info('Starting weekly health evaluation');

	try {
		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for weekly health evaluation');
			return json({
				success: true,
				summary: {
					evaluated: 0,
					qualified: 0,
					hardStopResets: 0,
					neutral: 0,
					errors: 0,
					elapsedMs
				}
			});
		}

		const aggregate = {
			evaluated: 0,
			qualified: 0,
			hardStopResets: 0,
			neutral: 0,
			errors: 0
		};

		for (const organization of organizationRows) {
			const orgLog = log.child({ organizationId: organization.id });
			const result = await runWeeklyHealthEvaluation(organization.id);

			aggregate.evaluated += result.evaluated;
			aggregate.qualified += result.qualified;
			aggregate.hardStopResets += result.hardStopResets;
			aggregate.neutral += result.neutral;
			aggregate.errors += result.errors;

			orgLog.info(result, 'Weekly health evaluation completed for organization');
		}

		const elapsedMs = Date.now() - startedAt;
		const result = {
			...aggregate,
			elapsedMs
		};

		log.info(result, 'Weekly health evaluation completed');

		return json({
			success: true,
			summary: result
		});
	} catch (error) {
		log.error({ error }, 'Weekly health evaluation failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
