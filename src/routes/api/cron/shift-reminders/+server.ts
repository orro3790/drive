/**
 * Shift Reminders Cron Job
 *
 * Runs at 10:00 and 11:00 UTC to guarantee one 06:00 Toronto run across DST.
 * Sends push notifications to drivers with shifts today.
 *
 * @see DRV-n1y
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { format, toZonedTime } from 'date-fns-tz';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	assignments,
	notifications,
	organizations,
	routes,
	shifts,
	warehouses
} from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendNotification } from '$lib/server/services/notifications';
import { verifyCronAuth } from '$lib/server/cron/auth';

const TORONTO_TZ = 'America/Toronto';

function getTodayToronto(): string {
	const now = new Date();
	return format(toZonedTime(now, TORONTO_TZ), 'yyyy-MM-dd');
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'shift-reminders' });
	const startedAt = Date.now();
	const today = getTodayToronto();

	log.info({ today }, 'Starting shift reminders cron job');

	try {
		let sentCount = 0;
		let skippedDuplicates = 0;
		let errorCount = 0;

		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for shift reminders');
			return json({
				success: true,
				sentCount,
				skippedDuplicates,
				errorCount,
				elapsedMs
			});
		}

		for (const organization of organizationRows) {
			const organizationId = organization.id;
			const orgLog = log.child({ organizationId });

			// Find all scheduled assignments for today that have a driver within this org
			const todayAssignments = await db
				.select({
					assignmentId: assignments.id,
					userId: assignments.userId,
					routeName: routes.name,
					warehouseName: warehouses.name
				})
				.from(assignments)
				.innerJoin(routes, eq(routes.id, assignments.routeId))
				.innerJoin(warehouses, eq(warehouses.id, assignments.warehouseId))
				.where(
					and(
						eq(warehouses.organizationId, organizationId),
						eq(assignments.date, today),
						eq(assignments.status, 'scheduled'),
						isNotNull(assignments.userId)
					)
				);

			// Get shifts that have started for today's assignments within this org
			const startedShiftAssignmentIds = new Set(
				(
					await db
						.select({ assignmentId: shifts.assignmentId })
						.from(shifts)
						.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
						.innerJoin(warehouses, eq(warehouses.id, assignments.warehouseId))
						.where(
							and(
								eq(warehouses.organizationId, organizationId),
								eq(assignments.date, today),
								isNotNull(shifts.startedAt)
							)
						)
				).map((row) => row.assignmentId)
			);

			// Filter out assignments with started shifts
			const toNotify = todayAssignments.filter(
				(a) => !startedShiftAssignmentIds.has(a.assignmentId)
			);

			orgLog.info(
				{
					totalAssignments: todayAssignments.length,
					alreadyStarted: startedShiftAssignmentIds.size,
					toNotify: toNotify.length
				},
				'Found assignments to remind'
			);

			const candidateUserIds = Array.from(
				new Set(
					toNotify
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
									eq(notifications.type, 'shift_reminder'),
									inArray(notifications.userId, candidateUserIds),
									sql`${notifications.data} ->> 'date' = ${today}`
								)
							);

			const seenDedupeKeys = new Set(
				existingDedupeRows
					.map((row) => row.dedupeKey)
					.filter((dedupeKey): dedupeKey is string => Boolean(dedupeKey))
			);

			// Send notifications
			for (const assignment of toNotify) {
				if (!assignment.userId) continue;

				const dedupeKey = `shift_reminder:${organizationId}:${assignment.assignmentId}:${assignment.userId}:${today}`;
				if (seenDedupeKeys.has(dedupeKey)) {
					skippedDuplicates++;
					continue;
				}

				try {
					await sendNotification(assignment.userId, 'shift_reminder', {
						customBody: `Your shift on route ${assignment.routeName} at ${assignment.warehouseName} is today.`,
						organizationId,
						data: {
							assignmentId: assignment.assignmentId,
							routeName: assignment.routeName,
							warehouseName: assignment.warehouseName,
							date: today,
							dedupeKey
						}
					});
					seenDedupeKeys.add(dedupeKey);
					sentCount++;
				} catch (error) {
					errorCount++;
					orgLog.error(
						{ error, userId: assignment.userId, assignmentId: assignment.assignmentId },
						'Failed to send shift reminder'
					);
				}
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{
				sentCount,
				skippedDuplicates,
				errorCount,
				elapsedMs,
				today
			},
			'Shift reminders cron job completed'
		);

		return json({
			success: true,
			sentCount,
			skippedDuplicates,
			errorCount,
			elapsedMs
		});
	} catch (error) {
		log.error({ error }, 'Shift reminders cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
