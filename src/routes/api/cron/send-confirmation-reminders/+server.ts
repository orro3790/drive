/**
 * Confirmation Reminders Cron Job
 *
 * Runs at 10:05 and 11:05 UTC to guarantee one 06:05 Toronto run across DST.
 * Sends reminders to drivers with unconfirmed shifts 3 days out.
 *
 * Schedule: 5 10,11 * * *
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { and, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	assignments,
	notifications,
	organizations,
	routes,
	warehouses
} from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendNotification } from '$lib/server/services/notifications';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { verifyCronAuth } from '$lib/server/cron/auth';
import * as m from '$lib/paraglide/messages.js';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'send-confirmation-reminders' });
	const startedAt = Date.now();
	const nowToronto = toZonedTime(new Date(), dispatchPolicy.timezone.toronto);
	const targetDate = format(
		addDays(nowToronto, dispatchPolicy.confirmation.reminderLeadDays),
		'yyyy-MM-dd'
	);

	log.info({ targetDate }, 'Starting confirmation reminders cron');

	try {
		let sent = 0;
		let skippedDuplicates = 0;
		let errors = 0;

		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for confirmation reminders');
			return json({ success: true, sent, skippedDuplicates, errors, date: targetDate, elapsedMs });
		}

		for (const organization of organizationRows) {
			const organizationId = organization.id;
			const orgLog = log.child({ organizationId });

			const unconfirmed = await db
				.select({
					assignmentId: assignments.id,
					userId: assignments.userId,
					date: assignments.date,
					routeName: routes.name
				})
				.from(assignments)
				.innerJoin(routes, eq(routes.id, assignments.routeId))
				.innerJoin(warehouses, eq(warehouses.id, assignments.warehouseId))
				.where(
					and(
						eq(warehouses.organizationId, organizationId),
						eq(assignments.date, targetDate),
						eq(assignments.status, 'scheduled'),
						isNotNull(assignments.userId),
						isNull(assignments.confirmedAt),
						gte(assignments.date, dispatchPolicy.confirmation.deploymentDate)
					)
				);

			const candidateUserIds = Array.from(
				new Set(
					unconfirmed
						.map((assignment) => assignment.userId)
						.filter((userId): userId is string => Boolean(userId))
				)
			);

			const existingDedupeRows =
				candidateUserIds.length === 0
					? []
					: await db
							.select({ dedupeKey: sql<string>`${notifications.data} ->> 'dedupeKey'` })
							.from(notifications)
							.where(
								and(
									eq(notifications.organizationId, organizationId),
									eq(notifications.type, 'confirmation_reminder'),
									inArray(notifications.userId, candidateUserIds),
									sql`${notifications.data} ->> 'date' = ${targetDate}`
								)
							);

			const seenDedupeKeys = new Set(
				existingDedupeRows
					.map((row) => row.dedupeKey)
					.filter((dedupeKey): dedupeKey is string => Boolean(dedupeKey))
			);

			for (const assignment of unconfirmed) {
				if (!assignment.userId) continue;

				const dedupeKey = `confirmation_reminder:${organizationId}:${assignment.assignmentId}:${assignment.userId}:${assignment.date}`;
				if (seenDedupeKeys.has(dedupeKey)) {
					skippedDuplicates++;
					continue;
				}

				try {
					await sendNotification(assignment.userId, 'confirmation_reminder', {
						renderBody: (locale) =>
							m.notif_confirmation_reminder_body(
								{ date: assignment.date, routeName: assignment.routeName },
								{ locale }
							),
						organizationId,
						data: {
							assignmentId: assignment.assignmentId,
							routeName: assignment.routeName,
							date: assignment.date,
							dedupeKey
						}
					});
					seenDedupeKeys.add(dedupeKey);
					sent++;
				} catch (err) {
					errors++;
					orgLog.error(
						{ userId: assignment.userId, assignmentId: assignment.assignmentId, error: err },
						'Failed to send confirmation reminder'
					);
				}
			}

			orgLog.info(
				{
					candidateCount: unconfirmed.length,
					sent,
					skippedDuplicates,
					errors
				},
				'Confirmation reminder processing completed for organization'
			);
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{ sent, skippedDuplicates, errors, targetDate, elapsedMs },
			'Confirmation reminders cron completed'
		);

		return json({ success: true, sent, skippedDuplicates, errors, date: targetDate, elapsedMs });
	} catch (err) {
		log.error({ error: err }, 'Confirmation reminders cron failed');
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
