import type { HealthResponse } from '$lib/schemas/health';

export type HealthCardState = 'onboarding' | 'hard_stop' | 'corrective' | 'healthy' | 'milestone';

export function deriveHealthCardState(health: HealthResponse | null): HealthCardState {
	if (!health || health.isOnboarding || health.score === null) {
		return 'onboarding';
	}

	if (health.hardStop.triggered) {
		return 'hard_stop';
	}

	if (health.stars >= health.maxStars && health.simulation.bonusEligible) {
		return 'milestone';
	}

	if (health.score < health.tierThreshold / 2) {
		return 'corrective';
	}

	return 'healthy';
}

export function deriveHealthScoreColor(health: HealthResponse | null): string {
	if (!health) {
		return 'var(--text-muted)';
	}

	if (health.hardStop.triggered) {
		return 'var(--status-error)';
	}

	const score = health.score ?? 0;

	if (score >= health.tierThreshold) {
		return 'var(--status-success)';
	}

	if (score >= health.tierThreshold / 2) {
		return 'var(--status-warning)';
	}

	return 'var(--status-error)';
}

export function deriveThresholdFlags(health: HealthResponse | null): {
	isPastThreshold: boolean;
	isBuffActive: boolean;
	isCharging: boolean;
} {
	if (!health || health.score === null) {
		return {
			isPastThreshold: false,
			isBuffActive: false,
			isCharging: false
		};
	}

	const isPastThreshold = health.score >= health.tierThreshold;
	const isBuffActive = isPastThreshold && health.simulation.bonusEligible;

	return {
		isPastThreshold,
		isBuffActive,
		isCharging: isPastThreshold && !isBuffActive
	};
}
