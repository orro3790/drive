/**
 * Stale Shift Reminder Cron Job
 *
 * Runs hourly. Sends a reminder notification every 12 hours to drivers
 * who have an incomplete shift (arrivedAt set, completedAt null).
 *
 * Schedule: 0 * * * *
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	assignments,
	notifications,
	organizations,
	shifts,
	warehouses
} from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendNotification } from '$lib/server/services/notifications';
import { verifyCronAuth } from '$lib/server/cron/auth';
import * as m from '$lib/paraglide/messages.js';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'stale-shift-reminder' });
	const startedAt = Date.now();
	const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

	log.info('Starting stale shift reminder cron');

	try {
		let sent = 0;
		let skippedDuplicates = 0;
		let errors = 0;
		let staleCount = 0;

		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for stale shift reminders');
			return json({ success: true, sent, skippedDuplicates, errors, elapsedMs });
		}

		for (const organization of organizationRows) {
			const organizationId = organization.id;
			const orgLog = log.child({ organizationId });

			// Find all incomplete shifts where arrivedAt is more than 12 hours ago for this org
			const staleShifts = await db
				.select({
					assignmentId: shifts.assignmentId,
					arrivedAt: shifts.arrivedAt,
					userId: assignments.userId,
					date: assignments.date
				})
				.from(shifts)
				.innerJoin(assignments, eq(shifts.assignmentId, assignments.id))
				.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
				.where(
					and(
						eq(warehouses.organizationId, organizationId),
						isNotNull(shifts.arrivedAt),
						isNull(shifts.completedAt),
						isNull(shifts.cancelledAt),
						lt(shifts.arrivedAt, twelveHoursAgo)
					)
				);

			if (staleShifts.length === 0) {
				orgLog.info('No stale shifts found for organization');
				continue;
			}

			staleCount += staleShifts.length;

			// Build dedupe keys and batch-check for recent reminders
			const candidateUserIds = Array.from(
				new Set(staleShifts.map((s) => s.userId).filter((id): id is string => Boolean(id)))
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
									eq(notifications.type, 'stale_shift_reminder'),
									inArray(notifications.userId, candidateUserIds),
									sql`${notifications.createdAt} > ${twelveHoursAgo}`
								)
							);

			const seenDedupeKeys = new Set(
				existingDedupeRows.map((row) => row.dedupeKey).filter((k): k is string => Boolean(k))
			);

			for (const staleShift of staleShifts) {
				if (!staleShift.userId) continue;

				const dedupeKey = `stale_shift:${organizationId}:${staleShift.assignmentId}:${staleShift.userId}`;
				if (seenDedupeKeys.has(dedupeKey)) {
					skippedDuplicates++;
					continue;
				}

				try {
					await sendNotification(staleShift.userId, 'stale_shift_reminder', {
						renderBody: (locale) =>
							m.notif_stale_shift_reminder_body({ date: staleShift.date }, { locale }),
						organizationId,
						data: {
							assignmentId: staleShift.assignmentId,
							date: staleShift.date,
							dedupeKey
						}
					});
					seenDedupeKeys.add(dedupeKey);
					sent++;
				} catch (err) {
					errors++;
					orgLog.error(
						{ userId: staleShift.userId, assignmentId: staleShift.assignmentId, error: err },
						'Failed to send stale shift reminder'
					);
				}
			}

			orgLog.info(
				{ staleCount: staleShifts.length, sent, skippedDuplicates, errors },
				'Stale shift reminder processing completed for organization'
			);
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{ sent, skippedDuplicates, errors, staleCount, elapsedMs },
			'Stale shift reminder cron completed'
		);

		return json({ success: true, sent, skippedDuplicates, errors, elapsedMs });
	} catch (err) {
		log.error({ error: err }, 'Stale shift reminder cron failed');
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
