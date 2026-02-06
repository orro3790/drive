/**
 * Confirmation Reminders Cron Job
 *
 * Runs daily at 11:00 UTC (06:00 Toronto EST / 07:00 EDT).
 * Sends reminders to drivers with unconfirmed shifts 3 days out.
 *
 * Schedule: 0 11 * * *
 */

import { json } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { and, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { assignments, routes } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendNotification } from '$lib/server/services/notifications';
import { CONFIRMATION_DEPLOYMENT_DATE } from '$lib/server/services/confirmations';

const TORONTO_TZ = 'America/Toronto';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'send-confirmation-reminders' });
	const startedAt = Date.now();
	const nowToronto = toZonedTime(new Date(), TORONTO_TZ);
	const targetDate = format(addDays(nowToronto, 3), 'yyyy-MM-dd');

	log.info({ targetDate }, 'Starting confirmation reminders cron');

	try {
		const unconfirmed = await db
			.select({
				assignmentId: assignments.id,
				userId: assignments.userId,
				date: assignments.date,
				routeName: routes.name
			})
			.from(assignments)
			.innerJoin(routes, eq(routes.id, assignments.routeId))
			.where(
				and(
					eq(assignments.date, targetDate),
					eq(assignments.status, 'scheduled'),
					isNotNull(assignments.userId),
					isNull(assignments.confirmedAt),
					gte(assignments.date, CONFIRMATION_DEPLOYMENT_DATE)
				)
			);

		let sent = 0;
		let errors = 0;

		for (const assignment of unconfirmed) {
			if (!assignment.userId) continue;

			try {
				await sendNotification(assignment.userId, 'confirmation_reminder', {
					customBody: `Your shift on ${assignment.date} at ${assignment.routeName} needs confirmation within 24 hours.`,
					data: {
						assignmentId: assignment.assignmentId,
						routeName: assignment.routeName,
						date: assignment.date
					}
				});
				sent++;
			} catch (err) {
				errors++;
				log.error(
					{ userId: assignment.userId, assignmentId: assignment.assignmentId, error: err },
					'Failed to send confirmation reminder'
				);
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info({ sent, errors, targetDate, elapsedMs }, 'Confirmation reminders cron completed');

		return json({ success: true, sent, errors, date: targetDate, elapsedMs });
	} catch (err) {
		log.error({ error: err }, 'Confirmation reminders cron failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
