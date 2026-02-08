/**
 * Driver Health API
 *
 * GET /api/driver-health - Get health data for current driver:
 * - Current score (additive points)
 * - Stars (0-4) and streak weeks
 * - Tier threshold marker (96 pts = Tier II)
 * - Hard-stop flags and reasons
 * - Next milestone info
 * - Simulation rewards preview
 * - Contributions breakdown (point sources)
 * - Recent score history (last 7 snapshots)
 *
 * Read-only, driver-scoped. New drivers receive a neutral onboarding state.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverHealthState, driverHealthSnapshots } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { computeContributions } from '$lib/server/services/health';
import type { HealthResponse } from '$lib/schemas/health';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can access health data');
	}

	const userId = locals.user.id;

	const [healthState, recentSnapshots] = await Promise.all([
		db.select().from(driverHealthState).where(eq(driverHealthState.userId, userId)).limit(1),
		db
			.select({
				evaluatedAt: driverHealthSnapshots.evaluatedAt,
				score: driverHealthSnapshots.score,
				hardStopTriggered: driverHealthSnapshots.hardStopTriggered,
				reasons: driverHealthSnapshots.reasons
			})
			.from(driverHealthSnapshots)
			.where(eq(driverHealthSnapshots.userId, userId))
			.orderBy(desc(driverHealthSnapshots.evaluatedAt))
			.limit(7)
	]);

	const state = healthState[0];
	const { health } = dispatchPolicy;

	// New driver or no health state yet — return neutral onboarding state
	if (!state) {
		return json({
			tier: 'I' as const,
			score: null,
			stars: 0,
			streakWeeks: 0,
			tierThreshold: health.tierThreshold,
			maxStars: health.maxStars,
			hardStop: {
				triggered: false,
				assignmentPoolEligible: true,
				requiresManagerIntervention: false,
				reasons: []
			},
			nextMilestone: {
				targetStars: 1,
				currentStars: 0
			},
			simulation: {
				bonusEligible: false,
				bonusPercent: health.simulationBonus.fourStarBonusPercent,
				label: 'simulation'
			},
			contributions: null,
			recentScores: [],
			isOnboarding: true
		} satisfies HealthResponse);
	}

	// Compute live contributions
	const { contributions, score } = await computeContributions(userId);

	// Hard-stop: derive from state table (canonical source of truth)
	const hardStopActive = !state.assignmentPoolEligible || state.requiresManagerIntervention;
	const latestSnapshot = recentSnapshots[0];
	const hardStopReasons =
		hardStopActive && latestSnapshot?.hardStopTriggered ? (latestSnapshot.reasons ?? []) : [];

	// Tier II at tierThreshold points
	const tier = score >= health.tierThreshold ? 'II' : 'I';

	return json({
		tier: tier as 'I' | 'II',
		score,
		stars: state.stars,
		streakWeeks: state.streakWeeks,
		tierThreshold: health.tierThreshold,
		maxStars: health.maxStars,
		hardStop: {
			triggered: hardStopActive,
			assignmentPoolEligible: state.assignmentPoolEligible,
			requiresManagerIntervention: state.requiresManagerIntervention,
			reasons: hardStopReasons
		},
		nextMilestone: {
			targetStars: state.nextMilestoneStars,
			currentStars: state.stars
		},
		simulation: {
			bonusEligible: state.stars >= health.maxStars,
			bonusPercent: health.simulationBonus.fourStarBonusPercent,
			label: 'simulation'
		},
		contributions,
		recentScores: recentSnapshots.map((s) => ({
			date: s.evaluatedAt,
			score: s.score,
			hardStopTriggered: s.hardStopTriggered
		})),
		isOnboarding: false
	} satisfies HealthResponse);
};
