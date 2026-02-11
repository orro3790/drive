/**
 * Stale Shift Reminder Cron Job
 *
 * Runs hourly. Sends a reminder notification every 12 hours to drivers
 * who have an incomplete shift (arrivedAt set, completedAt null).
 *
 * Schedule: 0 * * * *
 */

import { json } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { assignments, notifications, shifts } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendNotification } from '$lib/server/services/notifications';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'stale-shift-reminder' });
	const startedAt = Date.now();
	const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

	log.info('Starting stale shift reminder cron');

	try {
		// Find all incomplete shifts where arrivedAt is more than 12 hours ago
		const staleShifts = await db
			.select({
				assignmentId: shifts.assignmentId,
				arrivedAt: shifts.arrivedAt,
				userId: assignments.userId,
				date: assignments.date
			})
			.from(shifts)
			.innerJoin(assignments, eq(shifts.assignmentId, assignments.id))
			.where(
				and(
					isNotNull(shifts.arrivedAt),
					isNull(shifts.completedAt),
					isNull(shifts.cancelledAt),
					lt(shifts.arrivedAt, twelveHoursAgo)
				)
			);

		if (staleShifts.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No stale shifts found');
			return json({ success: true, sent: 0, skippedDuplicates: 0, errors: 0, elapsedMs });
		}

		// Build dedupe keys and batch-check for recent reminders
		const candidateUserIds = Array.from(
			new Set(
				staleShifts
					.map((s) => s.userId)
					.filter((id): id is string => Boolean(id))
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
								eq(notifications.type, 'stale_shift_reminder'),
								inArray(notifications.userId, candidateUserIds),
								sql`${notifications.createdAt} > ${twelveHoursAgo}`
							)
						);

		const seenDedupeKeys = new Set(
			existingDedupeRows
				.map((row) => row.dedupeKey)
				.filter((k): k is string => Boolean(k))
		);

		let sent = 0;
		let skippedDuplicates = 0;
		let errors = 0;

		for (const staleShift of staleShifts) {
			if (!staleShift.userId) continue;

			const dedupeKey = `stale_shift:${staleShift.assignmentId}:${staleShift.userId}`;
			if (seenDedupeKeys.has(dedupeKey)) {
				skippedDuplicates++;
				continue;
			}

			try {
				await sendNotification(staleShift.userId, 'stale_shift_reminder', {
					customBody: `You have an incomplete shift from ${staleShift.date}. Please close it out to start new shifts.`,
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
				log.error(
					{ userId: staleShift.userId, assignmentId: staleShift.assignmentId, error: err },
					'Failed to send stale shift reminder'
				);
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{ sent, skippedDuplicates, errors, staleCount: staleShifts.length, elapsedMs },
			'Stale shift reminder cron completed'
		);

		return json({ success: true, sent, skippedDuplicates, errors, elapsedMs });
	} catch (err) {
		log.error({ error: err }, 'Stale shift reminder cron failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
