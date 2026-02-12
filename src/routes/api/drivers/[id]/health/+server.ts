/**
 * Driver Health API (Manager)
 *
 * GET /api/drivers/[id]/health - Get health data for a specific driver
 *
 * Manager-accessible endpoint returning the same HealthResponse shape as
 * /api/driver-health, but scoped to the driver identified by route param [id].
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverHealthState, driverHealthSnapshots, user } from '$lib/server/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { computeContributions } from '$lib/server/services/health';
import type { HealthResponse } from '$lib/schemas/health';
import { requireManagerWithOrg } from '$lib/server/org-scope';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { organizationId } = requireManagerWithOrg(locals);

	const { id } = params;

	// Verify the target user exists, is a driver, and is in the same org
	const [target] = await db
		.select({ id: user.id, role: user.role })
		.from(user)
		.where(and(eq(user.id, id), eq(user.organizationId, organizationId)));

	if (!target) {
		throw error(404, 'Driver not found');
	}

	if (target.role !== 'driver') {
		throw error(400, 'User is not a driver');
	}

	const [healthState, recentSnapshots] = await Promise.all([
		db.select().from(driverHealthState).where(eq(driverHealthState.userId, id)).limit(1),
		db
			.select({
				evaluatedAt: driverHealthSnapshots.evaluatedAt,
				score: driverHealthSnapshots.score,
				hardStopTriggered: driverHealthSnapshots.hardStopTriggered,
				reasons: driverHealthSnapshots.reasons
			})
			.from(driverHealthSnapshots)
			.where(eq(driverHealthSnapshots.userId, id))
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
	const { contributions, score } = await computeContributions(id);

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
