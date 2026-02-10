/**
 * No-Show Detection Service
 *
 * Detects confirmed assignments where drivers failed to arrive by 9 AM Toronto time.
 * Creates emergency bid windows with 20% pay bonus and notifies available drivers.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	bidWindows,
	driverHealthState,
	driverMetrics,
	routes,
	shifts,
	user,
	warehouses
} from '$lib/server/db/schema';
import { createBidWindow } from '$lib/server/services/bidding';
import {
	notifyAvailableDriversForEmergency,
	sendManagerAlert
} from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import logger from '$lib/server/logger';
import { dispatchPolicy, parseRouteStartTime } from '$lib/config/dispatchPolicy';
import { getTorontoDateTimeInstant, toTorontoDateString } from '$lib/server/time/toronto';

function getTorontoNow(): Date {
	return new Date();
}

function getRouteArrivalDeadline(dateString: string, startTime: string | null): Date {
	const { hours, minutes } = parseRouteStartTime(startTime);
	return getTorontoDateTimeInstant(dateString, { hours, minutes });
}

export interface NoShowDetectionResult {
	evaluated: number;
	noShows: number;
	bidWindowsCreated: number;
	managerAlertsSent: number;
	driversNotified: number;
	errors: number;
	skippedBeforeDeadline: boolean;
}

/**
 * Detect no-shows for today's confirmed assignments.
 *
 * A no-show is a confirmed assignment where the driver has not arrived by 9 AM Toronto time.
 * "Arrived" means a shift record exists with arrivedAt set.
 *
 * For each no-show:
 * 1. Create emergency bid window (mode='emergency', payBonusPercent=20)
 * 2. Increment driver's noShows metric
 * 3. Alert the route's manager
 * 4. Notify available drivers about the emergency route
 */
export async function detectNoShows(): Promise<NoShowDetectionResult> {
	const log = logger.child({ operation: 'detectNoShows' });
	const nowToronto = getTorontoNow();
	const today = toTorontoDateString(nowToronto);

	// Find confirmed assignments for today where driver hasn't arrived.
	// We fetch all confirmed-but-not-arrived assignments and filter per-route
	// deadline below, since each route may have a different start time.
	const candidates = await db
		.select({
			assignmentId: assignments.id,
			routeId: assignments.routeId,
			warehouseId: assignments.warehouseId,
			assignmentDate: assignments.date,
			assignmentStatus: assignments.status,
			driverId: assignments.userId,
			driverName: user.name,
			routeName: routes.name,
			routeStartTime: routes.startTime,
			warehouseName: warehouses.name,
			existingWindowId: bidWindows.id,
			arrivedAt: shifts.arrivedAt
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.leftJoin(
			bidWindows,
			and(eq(assignments.id, bidWindows.assignmentId), eq(bidWindows.status, 'open'))
		)
		.leftJoin(user, eq(assignments.userId, user.id))
		.where(
			and(
				eq(assignments.date, today),
				eq(assignments.status, 'scheduled'),
				isNotNull(assignments.userId),
				isNotNull(assignments.confirmedAt),
				isNull(shifts.arrivedAt)
			)
		);

	let bidWindowsCreated = 0;
	let managerAlertsSent = 0;
	let driversNotified = 0;
	let errors = 0;

	for (const candidate of candidates) {
		// Per-route deadline: skip if current time hasn't passed this route's start time
		const routeDeadline = getRouteArrivalDeadline(today, candidate.routeStartTime);
		if (nowToronto < routeDeadline) {
			log.debug(
				{ assignmentId: candidate.assignmentId, routeStartTime: candidate.routeStartTime },
				'Skipping — route deadline not yet passed'
			);
			continue;
		}

		// Skip if there's already an open bid window (idempotent for dual cron runs)
		if (candidate.existingWindowId) {
			log.debug(
				{ assignmentId: candidate.assignmentId },
				'Skipping — open bid window already exists'
			);
			continue;
		}

		try {
			// 1. Create emergency bid window
			const result = await createBidWindow(candidate.assignmentId, {
				mode: 'emergency',
				trigger: 'no_show',
				payBonusPercent: dispatchPolicy.bidding.emergencyBonusPercent,
				allowPastShift: true
			});

			if (result.success) {
				bidWindowsCreated++;

				// 2. Increment driver noShows metric and reset health score
				if (candidate.driverId) {
					try {
						await db
							.update(driverMetrics)
							.set({
								noShows: sql`${driverMetrics.noShows} + 1`,
								updatedAt: new Date()
							})
							.where(eq(driverMetrics.userId, candidate.driverId));

						// No-show = full score reset
						await db
							.update(driverHealthState)
							.set({
								currentScore: 0,
								lastScoreResetAt: new Date(),
								stars: 0,
								streakWeeks: 0,
								assignmentPoolEligible: false,
								requiresManagerIntervention: true,
								updatedAt: new Date()
							})
							.where(eq(driverHealthState.userId, candidate.driverId));
					} catch (error) {
						log.warn(
							{ driverId: candidate.driverId, error },
							'Failed to update noShow metrics/health'
						);
					}
				}

				// 3. Alert route manager
				try {
					await sendManagerAlert(candidate.routeId, 'driver_no_show', {
						routeName: candidate.routeName ?? 'Unknown Route',
						driverName: candidate.driverName ?? 'A driver',
						date: candidate.assignmentDate
					});
					managerAlertsSent++;
				} catch (error) {
					log.warn(
						{ assignmentId: candidate.assignmentId, error },
						'Manager alert failed for no-show'
					);
				}

				// 4. Notify available drivers about emergency route
				try {
					const notifiedCount = await notifyAvailableDriversForEmergency({
						assignmentId: candidate.assignmentId,
						routeName: candidate.routeName ?? 'Unknown Route',
						warehouseName: candidate.warehouseName ?? 'Unknown Warehouse',
						date: candidate.assignmentDate,
						payBonusPercent: dispatchPolicy.bidding.emergencyBonusPercent
					});
					driversNotified += notifiedCount;
				} catch (error) {
					log.warn(
						{ assignmentId: candidate.assignmentId, error },
						'Emergency notification failed'
					);
				}

				// 5. Create audit log
				await createAuditLog({
					entityType: 'assignment',
					entityId: candidate.assignmentId,
					action: 'no_show_detected',
					actorType: 'system',
					actorId: null,
					changes: {
						driverId: candidate.driverId,
						driverName: candidate.driverName,
						reason: `no_arrival_by_${candidate.routeStartTime ?? '09:00'}`,
						routeStartTime: candidate.routeStartTime,
						bidWindowId: result.bidWindowId
					}
				});
			} else {
				log.info(
					{ assignmentId: candidate.assignmentId, reason: result.reason },
					'No-show bid window not created'
				);
			}
		} catch (error) {
			errors++;
			log.error({ assignmentId: candidate.assignmentId, error }, 'Failed to process no-show');
		}
	}

	const noShowCount = bidWindowsCreated;
	log.info(
		{ evaluated: candidates.length, noShows: noShowCount, bidWindowsCreated, driversNotified },
		'No-show detection completed'
	);

	return {
		evaluated: candidates.length,
		noShows: noShowCount,
		bidWindowsCreated,
		managerAlertsSent,
		driversNotified,
		errors,
		skippedBeforeDeadline: false
	};
}
