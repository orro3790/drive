export const dispatchPolicy = {
	timezone: {
		toronto: 'America/Toronto'
	},
	shifts: {
		startHourLocal: 7,
		arrivalDeadlineHourLocal: 9,
		completionEditWindowHours: 1
	},
	scheduling: {
		weekLengthDays: 7
	},
	confirmation: {
		windowDaysBeforeShift: 7,
		deadlineHoursBeforeShift: 48,
		reminderLeadDays: 3,
		deploymentDate: '2026-03-01'
	},
	bidding: {
		instantModeCutoffHours: 24,
		emergencyBonusPercent: 20,
		familiarityNormalizationCap: 20,
		preferenceTopN: 3,
		scoreWeights: {
			completionRate: 0.4,
			routeFamiliarity: 0.3,
			attendanceRate: 0.2,
			routePreferenceBonus: 0.1
		}
	},
	flagging: {
		attendanceThresholds: {
			earlyShiftCount: 10,
			beforeEarlyShiftCount: 0.8,
			atOrAfterEarlyShiftCount: 0.7
		},
		gracePeriodDays: 7,
		reward: {
			minShifts: 20,
			minAttendanceRate: 0.95
		},
		weeklyCap: {
			base: 4,
			reward: 6,
			min: 1
		},
		ui: {
			watchBandAboveThreshold: 0.05
		}
	},
	health: {
		scoreWeights: {
			attendance: 50,
			completion: 30,
			reliability: 20
		},
		hardStopScoreCap: 49,
		lateCancelRollingDays: 30,
		lateCancelThreshold: 2,
		correctiveCompletionThreshold: 0.8,
		correctiveRecoveryDays: 7,
		qualifyingWeek: {
			minAttendanceRate: 1.0,
			minCompletionRate: 0.95,
			maxNoShows: 0,
			maxLateCancellations: 0
		},
		maxStars: 4,
		eliteThreshold: 80,
		simulationBonus: {
			fourStarBonusPercent: 10
		}
	},
	jobs: {
		notificationBatchSize: 10,
		performanceCheckBatchSize: 50
	}
} as const;

export function getAttendanceThreshold(totalShifts: number): number {
	return totalShifts < dispatchPolicy.flagging.attendanceThresholds.earlyShiftCount
		? dispatchPolicy.flagging.attendanceThresholds.beforeEarlyShiftCount
		: dispatchPolicy.flagging.attendanceThresholds.atOrAfterEarlyShiftCount;
}

export function isRewardEligible(totalShifts: number, attendanceRate: number): boolean {
	return (
		totalShifts >= dispatchPolicy.flagging.reward.minShifts &&
		attendanceRate >= dispatchPolicy.flagging.reward.minAttendanceRate
	);
}

type BidScoreInputs = {
	completionRate: number;
	routeFamiliarityCount: number;
	attendanceRate: number;
	preferredRouteIds: readonly string[];
	routeId: string;
};

export function calculateBidScoreParts({
	completionRate,
	routeFamiliarityCount,
	attendanceRate,
	preferredRouteIds,
	routeId
}: BidScoreInputs) {
	const familiarityNormalized = Math.min(
		routeFamiliarityCount / dispatchPolicy.bidding.familiarityNormalizationCap,
		1
	);
	const preferenceBonus = preferredRouteIds
		.slice(0, dispatchPolicy.bidding.preferenceTopN)
		.includes(routeId)
		? 1
		: 0;

	const completionRatePart = completionRate * dispatchPolicy.bidding.scoreWeights.completionRate;
	const routeFamiliarityPart =
		familiarityNormalized * dispatchPolicy.bidding.scoreWeights.routeFamiliarity;
	const attendanceRatePart = attendanceRate * dispatchPolicy.bidding.scoreWeights.attendanceRate;
	const routePreferenceBonusPart =
		preferenceBonus * dispatchPolicy.bidding.scoreWeights.routePreferenceBonus;

	return {
		completionRatePart,
		routeFamiliarityPart,
		attendanceRatePart,
		routePreferenceBonusPart,
		total: completionRatePart + routeFamiliarityPart + attendanceRatePart + routePreferenceBonusPart
	};
}
