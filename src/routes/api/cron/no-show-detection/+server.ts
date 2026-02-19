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
import { db } from '$lib/server/db';
import { organizations } from '$lib/server/db/schema';
import { detectNoShowsForOrganization } from '$lib/server/services/noshow';
import { verifyCronAuth } from '$lib/server/cron/auth';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'no-show-detection' });
	const startedAt = Date.now();
	log.info('Starting no-show detection cron job');

	try {
		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for no-show detection');
			return json({
				success: true,
				evaluated: 0,
				noShows: 0,
				bidWindowsCreated: 0,
				managerAlertsSent: 0,
				driversNotified: 0,
				errors: 0,
				skippedBeforeDeadline: false,
				elapsedMs
			});
		}

		const aggregate = {
			evaluated: 0,
			noShows: 0,
			bidWindowsCreated: 0,
			managerAlertsSent: 0,
			driversNotified: 0,
			errors: 0,
			skippedBeforeDeadline: false
		};

		for (const organization of organizationRows) {
			const orgLog = log.child({ organizationId: organization.id });
			const result = await detectNoShowsForOrganization(organization.id);

			aggregate.evaluated += result.evaluated;
			aggregate.noShows += result.noShows;
			aggregate.bidWindowsCreated += result.bidWindowsCreated;
			aggregate.managerAlertsSent += result.managerAlertsSent;
			aggregate.driversNotified += result.driversNotified;
			aggregate.errors += result.errors;

			orgLog.info(result, 'No-show detection completed for organization');
		}

		const elapsedMs = Date.now() - startedAt;

		log.info(
			{
				...aggregate,
				elapsedMs
			},
			'No-show detection cron job completed'
		);

		return json({
			success: true,
			...aggregate,
			elapsedMs
		});
	} catch (error) {
		log.error({ error }, 'No-show detection cron job failed');
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
