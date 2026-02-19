/**
 * Auto-Drop Unconfirmed Shifts Cron Job
 *
 * Runs hourly. Drops drivers who haven't confirmed within the 48h deadline.
 * Creates bid windows for unconfirmed assignments, updates metrics, and notifies.
 *
 * Schedule: 0 * * * * (every hour)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	assignments,
	driverMetrics,
	organizations,
	routes,
	warehouses
} from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { createBidWindow } from '$lib/server/services/bidding';
import { sendNotification } from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { calculateConfirmationWindow } from '$lib/server/services/assignmentLifecycle';
import { verifyCronAuth } from '$lib/server/cron/auth';
import { formatNotificationShiftContext } from '$lib/utils/notifications/shiftContext';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const log = logger.child({ cron: 'auto-drop-unconfirmed' });
	const startedAt = Date.now();
	const now = new Date();

	log.info('Starting auto-drop unconfirmed cron');

	try {
		const includeDebugErrors = process.env.NIGHTLY_CRON_E2E === '1';
		const debugErrors: string[] = [];

		const organizationRows = await db.select({ id: organizations.id }).from(organizations);

		if (organizationRows.length === 0) {
			const elapsedMs = Date.now() - startedAt;
			log.info({ elapsedMs }, 'No organizations found for auto-drop processing');
			return json({
				success: true,
				dropped: 0,
				bidWindowsCreated: 0,
				skippedNoWindow: 0,
				errors: 0,
				elapsedMs
			});
		}

		let dropped = 0;
		let bidWindowsCreated = 0;
		let skippedNoWindow = 0;
		let errors = 0;

		for (const organization of organizationRows) {
			const organizationId = organization.id;
			const orgLog = log.child({ organizationId });

			// Find assignments past the 48h confirmation deadline for this org only
			const candidates = await db
				.select({
					id: assignments.id,
					userId: assignments.userId,
					routeId: assignments.routeId,
					date: assignments.date,
					routeName: routes.name,
					routeStartTime: routes.startTime
				})
				.from(assignments)
				.innerJoin(routes, eq(assignments.routeId, routes.id))
				.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
				.where(
					and(
						eq(warehouses.organizationId, organizationId),
						eq(assignments.status, 'scheduled'),
						isNotNull(assignments.userId),
						isNull(assignments.confirmedAt),
						gte(assignments.date, dispatchPolicy.confirmation.deploymentDate)
					)
				);

			orgLog.info({ candidates: candidates.length }, 'Processing auto-drop candidates');

			for (const candidate of candidates) {
				const { deadline } = calculateConfirmationWindow(candidate.date);

				if (now < deadline) {
					continue; // Not past deadline yet
				}

				try {
					const originalUserId = candidate.userId!;

					// Create bid window
					const result = await createBidWindow(candidate.id, {
						organizationId,
						trigger: 'auto_drop'
					});
					if (!result.success) {
						skippedNoWindow++;
						orgLog.info(
							{ assignmentId: candidate.id, reason: result.reason },
							'Skipping auto-drop side effects because bid window was not created'
						);
						continue;
					}

					bidWindowsCreated++;

					await db.transaction(async (tx) => {
						// Set cancelType after bid window creation succeeds
						await tx
							.update(assignments)
							.set({ cancelType: 'auto_drop', updatedAt: now })
							.where(eq(assignments.id, candidate.id));

						// Increment autoDroppedShifts metric only when replacement window exists
						await tx
							.update(driverMetrics)
							.set({
								autoDroppedShifts: sql`${driverMetrics.autoDroppedShifts} + 1`,
								updatedAt: now
							})
							.where(eq(driverMetrics.userId, originalUserId));

						await createAuditLog(
							{
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
							},
							tx
						);
					});

					dropped++;

					// Notify the original driver
					try {
						const shiftContext = formatNotificationShiftContext(
							candidate.date,
							candidate.routeStartTime
						);
						await sendNotification(originalUserId, 'shift_auto_dropped', {
							customBody: `Your shift on ${candidate.routeName} for ${shiftContext} was dropped because it wasn't confirmed in time.`,
							organizationId,
							data: {
								assignmentId: candidate.id,
								routeName: candidate.routeName,
								routeStartTime: candidate.routeStartTime,
								assignmentDate: candidate.date,
								date: candidate.date
							}
						});
					} catch (notifyError) {
						errors++;
						if (includeDebugErrors) {
							debugErrors.push(`notifyError assignmentId=${candidate.id}: ${String(notifyError)}`);
						}
						orgLog.error(
							{ assignmentId: candidate.id, error: notifyError },
							'Failed to notify driver after auto-drop'
						);
					}
				} catch (err) {
					errors++;
					if (includeDebugErrors) {
						debugErrors.push(`candidateError assignmentId=${candidate.id}: ${String(err)}`);
					}
					orgLog.error(
						{ assignmentId: candidate.id, error: err },
						'Failed to auto-drop assignment'
					);
				}
			}
		}

		const elapsedMs = Date.now() - startedAt;
		log.info(
			{ dropped, bidWindowsCreated, skippedNoWindow, errors, elapsedMs },
			'Auto-drop cron completed'
		);

		return json({
			success: true,
			dropped,
			bidWindowsCreated,
			skippedNoWindow,
			errors,
			elapsedMs,
			...(includeDebugErrors ? { debugErrors: debugErrors.slice(0, 10) } : {})
		});
	} catch (err) {
		log.error({ error: err }, 'Auto-drop cron failed');
		return json({ message: 'Internal server error' }, { status: 500 });
	}
};
