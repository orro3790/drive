/**
 * Driver Health API
 *
 * GET /api/driver-health - Get health data for current driver:
 * - Current score (0-100)
 * - Stars (0-4) and streak weeks
 * - Elite threshold marker
 * - Hard-stop flags and reasons
 * - Next milestone info
 * - Simulation rewards preview
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
				attendanceRate: driverHealthSnapshots.attendanceRate,
				completionRate: driverHealthSnapshots.completionRate,
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
			score: null,
			stars: 0,
			streakWeeks: 0,
			eliteThreshold: health.eliteThreshold,
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
			recentScores: [],
			isOnboarding: true
		});
	}

	// Hard-stop: derive from state table (canonical source of truth).
	// Pool eligibility is a one-way latch in the health service — once tripped,
	// only manager intervention can reinstate. Snapshot may lag behind state.
	const hardStopActive = !state.assignmentPoolEligible || state.requiresManagerIntervention;
	const latestSnapshot = recentSnapshots[0];
	const hardStopReasons =
		hardStopActive && latestSnapshot?.hardStopTriggered ? (latestSnapshot.reasons ?? []) : [];

	return json({
		score: state.currentScore,
		stars: state.stars,
		streakWeeks: state.streakWeeks,
		eliteThreshold: health.eliteThreshold,
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
		recentScores: recentSnapshots.map((s) => ({
			date: s.evaluatedAt,
			score: s.score,
			attendanceRate: s.attendanceRate,
			completionRate: s.completionRate,
			hardStopTriggered: s.hardStopTriggered
		})),
		isOnboarding: false
	});
};
