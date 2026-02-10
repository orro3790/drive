import { describe, expect, it } from 'vitest';

import type { HealthResponse } from '$lib/schemas/health';
import {
	deriveHealthCardState,
	deriveHealthScoreColor,
	deriveThresholdFlags
} from '$lib/components/driver/healthCardState';

function createHealthResponse(overrides: Partial<HealthResponse> = {}): HealthResponse {
	const hardStop = {
		triggered: false,
		assignmentPoolEligible: true,
		requiresManagerIntervention: false,
		reasons: [],
		...(overrides.hardStop ?? {})
	};

	const simulation = {
		bonusEligible: false,
		bonusPercent: 10,
		label: 'simulation',
		...(overrides.simulation ?? {})
	};

	const nextMilestone = {
		targetStars: 2,
		currentStars: 1,
		...(overrides.nextMilestone ?? {})
	};

	const base: HealthResponse = {
		tier: 'I',
		score: 60,
		stars: 1,
		streakWeeks: 1,
		tierThreshold: 96,
		maxStars: 4,
		hardStop,
		nextMilestone,
		simulation,
		contributions: null,
		recentScores: [],
		isOnboarding: false
	};

	return {
		...base,
		...overrides,
		hardStop,
		nextMilestone,
		simulation
	};
}

describe('healthCardState UI mapping', () => {
	it('maps onboarding responses to onboarding state', () => {
		const health = createHealthResponse({
			score: null,
			isOnboarding: true
		});

		expect(deriveHealthCardState(health)).toBe('onboarding');
		expect(deriveThresholdFlags(health)).toEqual({
			isPastThreshold: false,
			isBuffActive: false,
			isCharging: false
		});
	});

	it('maps hard-stop responses to warning state and error color', () => {
		const health = createHealthResponse({
			hardStop: {
				triggered: true,
				assignmentPoolEligible: false,
				requiresManagerIntervention: true,
				reasons: ['No-show in last 30 days']
			}
		});

		expect(deriveHealthCardState(health)).toBe('hard_stop');
		expect(deriveHealthScoreColor(health)).toBe('var(--status-error)');
	});

	it('maps low-score non-hard-stop responses to corrective state', () => {
		const health = createHealthResponse({ score: 20 });

		expect(deriveHealthCardState(health)).toBe('corrective');
		expect(deriveHealthScoreColor(health)).toBe('var(--status-error)');
	});

	it('maps threshold-reaching non-milestone responses to healthy charging state', () => {
		const health = createHealthResponse({
			tier: 'II',
			score: 100,
			stars: 3,
			nextMilestone: {
				targetStars: 4,
				currentStars: 3
			}
		});

		expect(deriveHealthCardState(health)).toBe('healthy');
		expect(deriveHealthScoreColor(health)).toBe('var(--status-success)');
		expect(deriveThresholdFlags(health)).toEqual({
			isPastThreshold: true,
			isBuffActive: false,
			isCharging: true
		});
	});

	it('maps four-star bonus previews to milestone state', () => {
		const health = createHealthResponse({
			tier: 'II',
			score: 120,
			stars: 4,
			simulation: {
				bonusEligible: true,
				bonusPercent: 10,
				label: 'simulation'
			},
			nextMilestone: {
				targetStars: 4,
				currentStars: 4
			}
		});

		expect(deriveHealthCardState(health)).toBe('milestone');
		expect(deriveThresholdFlags(health)).toEqual({
			isPastThreshold: true,
			isBuffActive: true,
			isCharging: false
		});
	});
});
