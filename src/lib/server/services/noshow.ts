/**
 * No-Show Detection Service
 *
 * Detects assignments where drivers failed to start after shift start time.
 * Creates replacement bid windows and notifies managers.
 */

import { db } from '$lib/server/db';
import { assignments, bidWindows, routes, shifts, user } from '$lib/server/db/schema';
import { createBidWindow } from '$lib/server/services/bidding';
import { sendManagerAlert } from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';
import { set, startOfDay } from 'date-fns';
import logger from '$lib/server/logger';

const TORONTO_TZ = 'America/Toronto';
const DEFAULT_SHIFT_START_HOUR = 7;
const DEFAULT_SHIFT_START_MINUTE = 0;

function getTorontoNow(): Date {
	return toZonedTime(new Date(), TORONTO_TZ);
}

function getTorontoDateString(date: Date): string {
	return format(date, 'yyyy-MM-dd');
}

function getShiftStartForDate(date: Date): Date {
	return set(startOfDay(date), {
		hours: DEFAULT_SHIFT_START_HOUR,
		minutes: DEFAULT_SHIFT_START_MINUTE,
		seconds: 0,
		milliseconds: 0
	});
}

export interface NoShowDetectionResult {
	evaluated: number;
	noShows: number;
	bidWindowsCreated: number;
	managerAlertsSent: number;
	errors: number;
	skippedBeforeStart: boolean;
}

export async function detectNoShows(): Promise<NoShowDetectionResult> {
	const log = logger.child({ operation: 'detectNoShows' });
	const nowToronto = getTorontoNow();
	const today = getTorontoDateString(nowToronto);
	const shiftStart = getShiftStartForDate(nowToronto);

	if (nowToronto < shiftStart) {
		log.info({ today, shiftStart }, 'No-show detection skipped before shift start');
		return {
			evaluated: 0,
			noShows: 0,
			bidWindowsCreated: 0,
			managerAlertsSent: 0,
			errors: 0,
			skippedBeforeStart: true
		};
	}

	const candidates = await db
		.select({
			assignmentId: assignments.id,
			routeId: assignments.routeId,
			assignmentDate: assignments.date,
			assignmentStatus: assignments.status,
			driverId: assignments.userId,
			driverName: user.name,
			routeName: routes.name,
			existingWindowId: bidWindows.id,
			shiftStartedAt: shifts.startedAt
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.leftJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.leftJoin(bidWindows, eq(assignments.id, bidWindows.assignmentId))
		.leftJoin(user, eq(assignments.userId, user.id))
		.where(
			and(
				eq(assignments.date, today),
				eq(assignments.status, 'scheduled'),
				isNotNull(assignments.userId),
				isNull(shifts.startedAt)
			)
		);

	let bidWindowsCreated = 0;
	let managerAlertsSent = 0;
	let errors = 0;

	for (const candidate of candidates) {
		if (candidate.shiftStartedAt) {
			continue;
		}

		if (candidate.existingWindowId) {
			try {
				const updatedAt = new Date();
				await db
					.update(assignments)
					.set({ status: 'unfilled', updatedAt })
					.where(eq(assignments.id, candidate.assignmentId));

				await createAuditLog({
					entityType: 'assignment',
					entityId: candidate.assignmentId,
					action: 'unfilled',
					actorType: 'system',
					actorId: null,
					changes: {
						before: { status: candidate.assignmentStatus },
						after: { status: 'unfilled' },
						reason: 'no_show',
						bidWindowId: candidate.existingWindowId
					}
				});
			} catch (error) {
				errors++;
				log.error(
					{ assignmentId: candidate.assignmentId, error },
					'Failed to mark no-show assignment as unfilled'
				);
			}
			continue;
		}

		try {
			const result = await createBidWindow(candidate.assignmentId, { allowPastShift: true });
			if (result.success) {
				bidWindowsCreated++;
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

	return {
		evaluated: candidates.length,
		noShows: candidates.length,
		bidWindowsCreated,
		managerAlertsSent,
		errors,
		skippedBeforeStart: false
	};
}
