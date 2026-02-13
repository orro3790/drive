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
import { and, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	assignments,
	driverPreferences,
	notifications,
	organizations,
	user,
	warehouses
} from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendBulkNotifications } from '$lib/server/services/notifications';
import { generateWeekSchedule, getWeekStart } from '$lib/server/services/scheduling';
import { verifyCronAuth } from '$lib/server/cron/auth';

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
	const authError = verifyCronAuth(request);
	if (authError) return authError;

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
		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			log.info('No organizations found for preference lock processing');
			return json({
				success: true,
				lockedCount: 0,
				schedule: {
					created: 0,
					skipped: 0,
					unfilled: 0,
					errors: []
				},
				notifiedCount: 0
			});
		}

		let lockedCount = 0;
		let notifiedCount = 0;
		const schedule = {
			created: 0,
			skipped: 0,
			unfilled: 0,
			errors: [] as string[]
		};

		for (const organization of organizationRows) {
			const organizationId = organization.id;
			const orgLog = log.child({ organizationId });

			const driverRows = await db
				.select({ id: user.id })
				.from(user)
				.where(and(eq(user.role, 'driver'), eq(user.organizationId, organizationId)));
			const driverIds = driverRows.map((driver) => driver.id);

			const lockedRows =
				driverIds.length === 0
					? []
					: await db
							.update(driverPreferences)
							.set({ lockedAt: lockAt })
							.where(
								and(
									inArray(driverPreferences.userId, driverIds),
									or(isNull(driverPreferences.lockedAt), ne(driverPreferences.lockedAt, lockAt))
								)
							)
							.returning({ id: driverPreferences.id });

			lockedCount += lockedRows.length;
			orgLog.info({ lockedCount: lockedRows.length }, 'Preferences locked for organization');

			const scheduleResult = await generateWeekSchedule(targetWeekStart, organizationId);
			schedule.created += scheduleResult.created;
			schedule.skipped += scheduleResult.skipped;
			schedule.unfilled += scheduleResult.unfilled;
			schedule.errors.push(
				...scheduleResult.errors.map((message) => `[${organizationId}] ${message}`)
			);

			orgLog.info(
				{
					created: scheduleResult.created,
					skipped: scheduleResult.skipped,
					unfilled: scheduleResult.unfilled,
					errorCount: scheduleResult.errors.length
				},
				'Schedule generation finished for organization'
			);

			if (scheduleResult.errors.length > 0) {
				orgLog.warn(
					{ errors: scheduleResult.errors.slice(0, 10) },
					'Schedule generation errors for organization'
				);
			}

			const assignmentRows = await db
				.select({ userId: assignments.userId })
				.from(assignments)
				.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
				.where(
					and(
						eq(warehouses.organizationId, organizationId),
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
						eq(notifications.organizationId, organizationId),
						eq(notifications.type, 'assignment_confirmed'),
						sql`${notifications.data} ->> 'weekStart' = ${weekStartString}`
					)
				);

			const alreadyNotified = new Set(existingNotifications.map((row) => row.userId));
			const recipients = assignedUserIds.filter((driverId) => !alreadyNotified.has(driverId));

			let orgNotifiedCount = 0;
			if (recipients.length > 0) {
				const notificationResults = await sendBulkNotifications(
					recipients,
					'assignment_confirmed',
					{
						organizationId,
						data: { weekStart: weekStartString }
					}
				);
				orgNotifiedCount = notificationResults.size;
			}

			notifiedCount += orgNotifiedCount;
			orgLog.info(
				{
					assignedDrivers: assignedUserIds.length,
					alreadyNotified: alreadyNotified.size,
					notifiedCount: orgNotifiedCount
				},
				'Assignment notifications processed for organization'
			);
		}

		log.info(
			{
				lockedCount,
				notifiedCount,
				scheduleCreated: schedule.created,
				scheduleSkipped: schedule.skipped,
				scheduleUnfilled: schedule.unfilled,
				scheduleErrors: schedule.errors.length
			},
			'Preference lock cron job completed'
		);

		return json({
			success: true,
			lockedCount,
			schedule,
			notifiedCount
		});
	} catch (error) {
		log.error({ error }, 'Preference lock cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
