/**
 * Driver Flagging Service
 *
 * Applies attendance-based flagging rules and weekly cap adjustments.
 * See docs/specs/SPEC.md Performance & Flagging.
 */

import { addDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { driverMetrics, user } from '$lib/server/db/schema';
import logger from '$lib/server/logger';
import { updateDriverMetrics } from '$lib/server/services/metrics';
import { sendNotification } from '$lib/server/services/notifications';
import { broadcastDriverFlagged } from '$lib/server/realtime/managerSse';
import { createAuditLog } from '$lib/server/services/audit';

const PRE_10_SHIFT_THRESHOLD = 0.8;
const POST_10_SHIFT_THRESHOLD = 0.7;
const REWARD_MIN_SHIFTS = 20;
const REWARD_ATTENDANCE_THRESHOLD = 0.95;
const GRACE_PERIOD_DAYS = 7;
const DEFAULT_WEEKLY_CAP = 4;
const REWARD_WEEKLY_CAP = 6;
const MIN_WEEKLY_CAP = 1;

export interface FlaggingResult {
	userId: string;
	totalShifts: number;
	attendanceRate: number;
	threshold: number;
	isFlagged: boolean;
	flagWarningDate: Date | null;
	weeklyCap: number;
	warningSent: boolean;
	gracePenaltyApplied: boolean;
	rewardApplied: boolean;
}

function getAttendanceThreshold(totalShifts: number): number {
	return totalShifts < 10 ? PRE_10_SHIFT_THRESHOLD : POST_10_SHIFT_THRESHOLD;
}

function isRewardEligible(totalShifts: number, attendanceRate: number): boolean {
	return totalShifts >= REWARD_MIN_SHIFTS && attendanceRate >= REWARD_ATTENDANCE_THRESHOLD;
}

export async function checkAndApplyFlag(userId: string): Promise<FlaggingResult | null> {
	const log = logger.child({ operation: 'checkAndApplyFlag', userId });

	const [userRecord] = await db
		.select({
			id: user.id,
			role: user.role,
			weeklyCap: user.weeklyCap,
			isFlagged: user.isFlagged,
			flagWarningDate: user.flagWarningDate
		})
		.from(user)
		.where(eq(user.id, userId));

	if (!userRecord) {
		log.warn('User not found, skipping flagging');
		return null;
	}

	if (userRecord.role !== 'driver') {
		log.debug({ role: userRecord.role }, 'Skipping non-driver user');
		return null;
	}

	let [metrics] = await db
		.select({
			totalShifts: driverMetrics.totalShifts,
			attendanceRate: driverMetrics.attendanceRate
		})
		.from(driverMetrics)
		.where(eq(driverMetrics.userId, userId));

	if (!metrics) {
		await updateDriverMetrics(userId);
		[metrics] = await db
			.select({
				totalShifts: driverMetrics.totalShifts,
				attendanceRate: driverMetrics.attendanceRate
			})
			.from(driverMetrics)
			.where(eq(driverMetrics.userId, userId));
	}

	const totalShifts = metrics?.totalShifts ?? 0;
	const attendanceRate = metrics?.attendanceRate ?? 0;
	const threshold = getAttendanceThreshold(totalShifts);
	const rewardEligible = isRewardEligible(totalShifts, attendanceRate);
	const shouldBeFlagged = totalShifts > 0 && attendanceRate < threshold;
	const baseWeeklyCap = rewardEligible ? REWARD_WEEKLY_CAP : DEFAULT_WEEKLY_CAP;

	const now = new Date();
	let nextIsFlagged = userRecord.isFlagged;
	let nextFlagWarningDate = userRecord.flagWarningDate;
	let nextWeeklyCap = baseWeeklyCap;
	let warningSent = false;
	let gracePenaltyApplied = false;

	if (shouldBeFlagged) {
		nextIsFlagged = true;
		if (!userRecord.isFlagged || !userRecord.flagWarningDate) {
			nextFlagWarningDate = now;
			warningSent = true;
		}

		if (nextFlagWarningDate) {
			const graceEndsAt = addDays(nextFlagWarningDate, GRACE_PERIOD_DAYS);
			if (graceEndsAt <= now) {
				nextWeeklyCap = Math.max(baseWeeklyCap - 1, MIN_WEEKLY_CAP);
				gracePenaltyApplied = nextWeeklyCap < baseWeeklyCap;
			}
		}
	} else {
		nextIsFlagged = false;
		nextFlagWarningDate = null;
		nextWeeklyCap = baseWeeklyCap;
	}

	const rewardApplied = rewardEligible && !shouldBeFlagged;
	const warningDateChanged =
		(userRecord.flagWarningDate?.getTime() ?? null) !== (nextFlagWarningDate?.getTime() ?? null);
	const needsUpdate =
		nextIsFlagged !== userRecord.isFlagged ||
		warningDateChanged ||
		nextWeeklyCap !== userRecord.weeklyCap;

	if (needsUpdate) {
		await db
			.update(user)
			.set({
				isFlagged: nextIsFlagged,
				flagWarningDate: nextFlagWarningDate,
				weeklyCap: nextWeeklyCap,
				updatedAt: now
			})
			.where(eq(user.id, userId));

		const action =
			nextIsFlagged && !userRecord.isFlagged
				? 'flag'
				: !nextIsFlagged && userRecord.isFlagged
					? 'unflag'
					: 'update';

		await createAuditLog({
			entityType: 'user',
			entityId: userId,
			action,
			actorType: 'system',
			actorId: null,
			changes: {
				before: {
					isFlagged: userRecord.isFlagged,
					flagWarningDate: userRecord.flagWarningDate,
					weeklyCap: userRecord.weeklyCap
				},
				after: {
					isFlagged: nextIsFlagged,
					flagWarningDate: nextFlagWarningDate,
					weeklyCap: nextWeeklyCap
				},
				attendanceRate,
				threshold,
				totalShifts,
				warningSent,
				gracePenaltyApplied,
				rewardApplied
			}
		});
	}

	if (nextIsFlagged && !userRecord.isFlagged) {
		broadcastDriverFlagged({
			driverId: userId,
			attendanceRate,
			threshold,
			totalShifts
		});
	}

	if (warningSent) {
		await sendNotification(userId, 'warning');
	}

	log.info(
		{
			totalShifts,
			attendanceRate,
			threshold,
			isFlagged: nextIsFlagged,
			weeklyCap: nextWeeklyCap,
			warningSent,
			gracePenaltyApplied,
			rewardApplied
		},
		'Flagging evaluation completed'
	);

	return {
		userId,
		totalShifts,
		attendanceRate,
		threshold,
		isFlagged: nextIsFlagged,
		flagWarningDate: nextFlagWarningDate,
		weeklyCap: nextWeeklyCap,
		warningSent,
		gracePenaltyApplied,
		rewardApplied
	};
}
