/**
 * Shared types for /api/driver-health endpoint.
 * Used by both the API response and the HealthCard component.
 */

export type HealthResponse = {
	score: number | null;
	stars: number;
	streakWeeks: number;
	eliteThreshold: number;
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
	recentScores: HealthSnapshot[];
	isOnboarding: boolean;
};

export type HealthSnapshot = {
	date: string;
	score: number;
	attendanceRate: number;
	completionRate: number;
	hardStopTriggered: boolean;
};
