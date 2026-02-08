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
		healthNormalizationCap: 96,
		seniorityCapMonths: 12,
		preferenceTopN: 3,
		scoreWeights: {
			health: 0.45,
			routeFamiliarity: 0.25,
			seniority: 0.15,
			routePreferenceBonus: 0.15
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
		points: {
			confirmedOnTime: 1,
			arrivedOnTime: 2,
			completedShift: 2,
			highDelivery: 1,
			bidPickup: 2,
			urgentPickup: 4,
			autoDrop: -12,
			lateCancel: -48
		},
		tierThreshold: 96,
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
		simulationBonus: {
			fourStarBonusPercent: 10
		},
		/** Display-only indicative deltas shown in schedule UI.
		 *  Values match actual point costs from health.points. */
		displayDeltas: {
			confirmedOnTime: 1,
			unconfirmed: -12,
			lateCancel: -48
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
	healthScore: number;
	routeFamiliarityCount: number;
	tenureMonths: number;
	preferredRouteIds: readonly string[];
	routeId: string;
};

export function calculateBidScoreParts({
	healthScore,
	routeFamiliarityCount,
	tenureMonths,
	preferredRouteIds,
	routeId
}: BidScoreInputs) {
	const healthNormalized = Math.min(
		healthScore / dispatchPolicy.bidding.healthNormalizationCap,
		1
	);
	const familiarityNormalized = Math.min(
		routeFamiliarityCount / dispatchPolicy.bidding.familiarityNormalizationCap,
		1
	);
	const seniorityNormalized = Math.min(
		tenureMonths / dispatchPolicy.bidding.seniorityCapMonths,
		1
	);
	const preferenceBonus = preferredRouteIds
		.slice(0, dispatchPolicy.bidding.preferenceTopN)
		.includes(routeId)
		? 1
		: 0;

	const healthPart = healthNormalized * dispatchPolicy.bidding.scoreWeights.health;
	const routeFamiliarityPart =
		familiarityNormalized * dispatchPolicy.bidding.scoreWeights.routeFamiliarity;
	const seniorityPart = seniorityNormalized * dispatchPolicy.bidding.scoreWeights.seniority;
	const routePreferenceBonusPart =
		preferenceBonus * dispatchPolicy.bidding.scoreWeights.routePreferenceBonus;

	return {
		healthPart,
		routeFamiliarityPart,
		seniorityPart,
		routePreferenceBonusPart,
		total: healthPart + routeFamiliarityPart + seniorityPart + routePreferenceBonusPart
	};
}
