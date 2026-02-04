/**
 * Lock Preferences Cron Job
 *
 * Scheduled: Monday 04:59 UTC (= Sunday 23:59 Toronto EST)
 * Locks driver preferences for week N+2 and triggers schedule generation.
 *
 * Note: Vercel cron uses UTC only. 04:59 UTC Monday = 23:59 EST Sunday.
 * During EDT (summer), this runs at 00:59 Monday Toronto time, but the
 * code calculates the correct week boundary internally.
 *
 * @see DRV-e30
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addDays, addWeeks, set, startOfDay } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { and, eq, gte, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { assignments, driverPreferences, notifications } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendBulkNotifications } from '$lib/server/services/notifications';
import { generateWeekSchedule, getWeekStart } from '$lib/server/services/scheduling';

const TORONTO_TZ = 'America/Toronto';

function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

function getCurrentLockDeadline(nowToronto: Date): Date {
	const day = nowToronto.getDay();
	const daysUntilSunday = day === 0 ? 7 : 7 - day;
	const nextSunday = addDays(startOfDay(nowToronto), daysUntilSunday);
	const currentSunday = addDays(nextSunday, -7);
	return set(currentSunday, { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 });
}

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret to prevent unauthorized access
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'lock-preferences' });
	const startedAt = new Date();
	const lockAt = getCurrentLockDeadline(toZonedTime(startedAt, TORONTO_TZ));
	const lockWeekStart = getWeekStart(lockAt);
	const targetWeekStart = addWeeks(lockWeekStart, 2);
	const targetWeekEnd = addDays(targetWeekStart, 7);
	const weekStartString = toTorontoDateString(targetWeekStart);
	const weekEndString = toTorontoDateString(targetWeekEnd);

	log.info(
		{
			targetWeekStart,
			weekStart: weekStartString,
			weekEnd: weekEndString,
			lockAt
		},
		'Starting preference lock cron job'
	);

	try {
		const lockedRows = await db
			.update(driverPreferences)
			.set({ lockedAt: lockAt })
			.where(or(isNull(driverPreferences.lockedAt), ne(driverPreferences.lockedAt, lockAt)))
			.returning({ id: driverPreferences.id });

		log.info({ lockedCount: lockedRows.length }, 'Preferences locked');

		const scheduleResult = await generateWeekSchedule(targetWeekStart);
		log.info(
			{
				created: scheduleResult.created,
				skipped: scheduleResult.skipped,
				unfilled: scheduleResult.unfilled,
				errorCount: scheduleResult.errors.length
			},
			'Schedule generation finished'
		);

		if (scheduleResult.errors.length > 0) {
			log.warn({ errors: scheduleResult.errors.slice(0, 10) }, 'Schedule generation errors');
		}

		const assignmentRows = await db
			.select({ userId: assignments.userId })
			.from(assignments)
			.where(
				and(
					isNotNull(assignments.userId),
					eq(assignments.status, 'scheduled'),
					gte(assignments.date, weekStartString),
					lt(assignments.date, weekEndString)
				)
			);

		const assignedUserIds = Array.from(
			new Set(
				assignmentRows.map((row) => row.userId).filter((userId): userId is string => !!userId)
			)
		);

		const existingNotifications = await db
			.select({ userId: notifications.userId })
			.from(notifications)
			.where(
				and(
					eq(notifications.type, 'assignment_confirmed'),
					sql`${notifications.data} ->> 'weekStart' = ${weekStartString}`
				)
			);

		const alreadyNotified = new Set(existingNotifications.map((row) => row.userId));
		const recipients = assignedUserIds.filter((userId) => !alreadyNotified.has(userId));

		let notifiedCount = 0;
		if (recipients.length > 0) {
			const notificationResults = await sendBulkNotifications(recipients, 'assignment_confirmed', {
				data: { weekStart: weekStartString }
			});
			notifiedCount = notificationResults.size;
		}

		log.info(
			{
				assignedDrivers: assignedUserIds.length,
				alreadyNotified: alreadyNotified.size,
				notifiedCount
			},
			'Assignment notifications processed'
		);

		log.info('Preference lock cron job completed');
		return json({
			success: true,
			lockedCount: lockedRows.length,
			schedule: scheduleResult,
			notifiedCount
		});
	} catch (error) {
		log.error({ error }, 'Preference lock cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
