/**
 * Shared types for /api/driver-health endpoint.
 * Used by both the API response and the HealthCard component.
 */

export type ContributionLine = { count: number; points: number };

export type HealthContributions = {
	confirmedOnTime: ContributionLine;
	arrivedOnTime: ContributionLine;
	completedShifts: ContributionLine;
	highDelivery: ContributionLine;
	bidPickups: ContributionLine;
	urgentPickups: ContributionLine;
	autoDrops: ContributionLine;
	lateCancellations: ContributionLine;
};

export type HealthResponse = {
	tier: 'I' | 'II';
	score: number | null;
	stars: number;
	streakWeeks: number;
	tierThreshold: number;
	maxStars: number;
	hardStop: {
		triggered: boolean;
		assignmentPoolEligible: boolean;
		requiresManagerIntervention: boolean;
		reasons: string[];
	};
	nextMilestone: {
		targetStars: number;
		currentStars: number;
	};
	simulation: {
		bonusEligible: boolean;
		bonusPercent: number;
		label: string;
	};
	contributions: HealthContributions | null;
	recentScores: HealthSnapshot[];
	isOnboarding: boolean;
};

export type HealthSnapshot = {
	date: string;
	score: number;
	hardStopTriggered: boolean;
};
