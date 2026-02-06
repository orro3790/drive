/**
 * Auto-Drop Unconfirmed Shifts Cron Job
 *
 * Runs hourly. Drops drivers who haven't confirmed within the 48h deadline.
 * Creates bid windows for unconfirmed assignments, updates metrics, and notifies.
 *
 * Schedule: 0 * * * * (every hour)
 */

import { json } from '@sveltejs/kit';
import { CRON_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { toZonedTime } from 'date-fns-tz';
import { parseISO, set } from 'date-fns';
import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { assignments, driverMetrics, routes } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { createBidWindow } from '$lib/server/services/bidding';
import { sendNotification } from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization')?.trim();
	const expectedToken = (CRON_SECRET || env.CRON_SECRET)?.trim();
	if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const log = logger.child({ cron: 'auto-drop-unconfirmed' });
	const startedAt = Date.now();
	const now = new Date();
	const nowToronto = toZonedTime(now, dispatchPolicy.timezone.toronto);

	log.info('Starting auto-drop unconfirmed cron');

	try {
		// Find assignments past the 48h confirmation deadline
		const candidates = await db
			.select({
				id: assignments.id,
				userId: assignments.userId,
				routeId: assignments.routeId,
				date: assignments.date,
				routeName: routes.name
			})
			.from(assignments)
			.innerJoin(routes, eq(assignments.routeId, routes.id))
			.where(
				and(
					eq(assignments.status, 'scheduled'),
					isNotNull(assignments.userId),
					isNull(assignments.confirmedAt),
					gte(assignments.date, dispatchPolicy.confirmation.deploymentDate)
				)
			);

		let dropped = 0;
		let bidWindowsCreated = 0;
		let errors = 0;

		for (const candidate of candidates) {
			// Check if past the 48h deadline
			const parsed = parseISO(candidate.date);
			const toronto = toZonedTime(parsed, dispatchPolicy.timezone.toronto);
			const shiftStart = set(toronto, {
				hours: dispatchPolicy.shifts.startHourLocal,
				minutes: 0,
				seconds: 0,
				milliseconds: 0
			});
			const hoursUntilShift = (shiftStart.getTime() - nowToronto.getTime()) / (1000 * 60 * 60);

			if (hoursUntilShift > dispatchPolicy.confirmation.deadlineHoursBeforeShift) {
				continue; // Not past deadline yet
			}

			try {
				const originalUserId = candidate.userId!;

				// Increment autoDroppedShifts metric
				await db
					.update(driverMetrics)
					.set({
						autoDroppedShifts: sql`${driverMetrics.autoDroppedShifts} + 1`,
						updatedAt: now
					})
					.where(eq(driverMetrics.userId, originalUserId));

				// Create bid window
				const result = await createBidWindow(candidate.id, {
					trigger: 'auto_drop'
				});
				if (result.success) {
					bidWindowsCreated++;
				}

				// Notify the original driver
				await sendNotification(originalUserId, 'shift_auto_dropped', {
					customBody: `Your shift on ${candidate.date} at ${candidate.routeName} was dropped because it wasn't confirmed in time.`,
					data: {
						assignmentId: candidate.id,
						routeName: candidate.routeName,
						date: candidate.date
					}
				});

				await createAuditLog({
					entityType: 'assignment',
					entityId: candidate.id,
					action: 'auto_drop',
					actorType: 'system',
					actorId: null,
					changes: {
						before: { status: 'scheduled', userId: originalUserId },
						after: { status: 'unfilled' },
						reason: 'unconfirmed_past_deadline'
					}
				});

				dropped++;
			} catch (err) {
				errors++;
				log.error({ assignmentId: candidate.id, error: err }, 'Failed to auto-drop assignment');
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info({ dropped, bidWindowsCreated, errors, elapsedMs }, 'Auto-drop cron completed');

		return json({ success: true, dropped, bidWindowsCreated, errors, elapsedMs });
	} catch (err) {
		log.error({ error: err }, 'Auto-drop cron failed');
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
