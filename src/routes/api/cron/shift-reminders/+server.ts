/**
 * Shift Reminders Cron Job
 *
 * Runs daily at 6:00 AM Toronto time.
 * Sends push notifications to drivers with shifts today.
 *
 * @see DRV-n1y
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { format, toZonedTime } from 'date-fns-tz';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { assignments, routes, shifts, warehouses } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { sendNotification } from '$lib/server/services/notifications';

const TORONTO_TZ = 'America/Toronto';

function getTodayToronto(): string {
	const now = new Date();
	return format(toZonedTime(now, TORONTO_TZ), 'yyyy-MM-dd');
}

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret to prevent unauthorized access
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'shift-reminders' });
	const startedAt = Date.now();
	const today = getTodayToronto();

	log.info({ today }, 'Starting shift reminders cron job');

	try {
		// Find all scheduled assignments for today that have a driver
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
					eq(assignments.date, today),
					eq(assignments.status, 'scheduled'),
					isNotNull(assignments.userId)
				)
			);

		// Get shifts that have started for today's assignments
		const startedShiftAssignmentIds = new Set(
			(
				await db
					.select({ assignmentId: shifts.assignmentId })
					.from(shifts)
					.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
					.where(and(eq(assignments.date, today), isNotNull(shifts.startedAt)))
			).map((row) => row.assignmentId)
		);

		// Filter out assignments with started shifts
		const toNotify = todayAssignments.filter(
			(a) => !startedShiftAssignmentIds.has(a.assignmentId)
		);

		log.info(
			{
				totalAssignments: todayAssignments.length,
				alreadyStarted: startedShiftAssignmentIds.size,
				toNotify: toNotify.length
			},
			'Found assignments to remind'
		);

		let sentCount = 0;
		let errorCount = 0;

		// Send notifications
		for (const assignment of toNotify) {
			if (!assignment.userId) continue;

			try {
				await sendNotification(assignment.userId, 'shift_reminder', {
					customBody: `Your shift on route ${assignment.routeName} at ${assignment.warehouseName} is today.`,
					data: {
						assignmentId: assignment.assignmentId,
						routeName: assignment.routeName,
						warehouseName: assignment.warehouseName,
						date: today
					}
				});
				sentCount++;
			} catch (error) {
				errorCount++;
				log.error(
					{ error, userId: assignment.userId, assignmentId: assignment.assignmentId },
					'Failed to send shift reminder'
				);
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{
				sentCount,
				errorCount,
				elapsedMs,
				today
			},
			'Shift reminders cron job completed'
		);

		return json({
			success: true,
			sentCount,
			errorCount,
			elapsedMs
		});
	} catch (error) {
		log.error({ error }, 'Shift reminders cron job failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
