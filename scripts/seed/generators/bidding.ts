/**
 * Bidding Generator
 *
 * Creates bid windows and bids for cancelled/unfilled assignments.
 * - Past closesAt -> status='resolved', winnerId set
 * - Future closesAt -> status='open'
 * - No-show assignments get emergency bid windows
 * - Bid windows include mode/trigger/payBonusPercent
 * - Bid scores use the real formula from dispatchPolicy
 */

import { addHours, subDays, subHours } from 'date-fns';
import type { GeneratedAssignment } from './assignments';
import type { GeneratedUser } from './users';
import type { GeneratedPreference } from './preferences';
import type { GeneratedHealthState } from './health';
import type { GeneratedRouteCompletion } from './route-completions';
import { dispatchPolicy, calculateBidScoreParts } from '../../../src/lib/config/dispatchPolicy';
import { isPastDate, isFutureDate, randomTimeOnDate } from '../utils/dates';
import { random, randomInt, getSeedNow } from '../utils/runtime';

export interface GeneratedBidWindow {
	assignmentIndex: number;
	opensAt: Date;
	closesAt: Date;
	status: 'open' | 'closed' | 'resolved';
	winnerId: string | null;
	mode: 'competitive' | 'instant' | 'emergency';
	trigger: string | null;
	payBonusPercent: number;
}

export interface GeneratedBid {
	assignmentIndex: number;
	userId: string;
	score: number;
	status: 'pending' | 'won' | 'lost';
	bidAt: Date;
	windowClosesAt: Date;
	resolvedAt: Date | null;
}

export interface GeneratedBiddingResult {
	bidWindows: GeneratedBidWindow[];
	bids: GeneratedBid[];
}

export interface BiddingContext {
	healthStates: GeneratedHealthState[];
	routeCompletions: GeneratedRouteCompletion[];
	preferences: GeneratedPreference[];
}

/**
 * Generate bid windows and bids for cancelled/unfilled/no-show assignments.
 */
export function generateBidding(
	assignments: GeneratedAssignment[],
	drivers: GeneratedUser[],
	noShowIndices: number[] = [],
	context?: BiddingContext
): GeneratedBiddingResult {
	const bidWindows: GeneratedBidWindow[] = [];
	const bids: GeneratedBid[] = [];

	// Get eligible drivers for bidding
	const eligibleDrivers = drivers.filter((d) => d.role === 'driver' && !d.isFlagged);

	if (eligibleDrivers.length === 0) {
		return { bidWindows, bids };
	}

	// Build lookups for real scoring
	const healthByUser = new Map<string, GeneratedHealthState>();
	const completionsByUserRoute = new Map<string, number>();
	const prefByUser = new Map<string, GeneratedPreference>();

	if (context) {
		for (const h of context.healthStates) {
			healthByUser.set(h.userId, h);
		}
		for (const c of context.routeCompletions) {
			completionsByUserRoute.set(`${c.userId}:${c.routeId}`, c.completionCount);
		}
		for (const p of context.preferences) {
			prefByUser.set(p.userId, p);
		}
	}

	// Compute tenure months per driver
	const now = getSeedNow();
	const tenureByUser = new Map<string, number>();
	for (const d of drivers) {
		const months = (now.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
		tenureByUser.set(d.id, Math.max(0, months));
	}

	// Track per-driver-per-date bids to enforce max 1 pending bid per driver per date
	const driverDateBids = new Map<string, Set<string>>();

	// Limit future open bid windows to a realistic count (3-5).
	const maxOpenWindows = 3 + randomInt(0, 3);

	const noShowSet = new Set(noShowIndices);
	const openCandidateIndices: number[] = [];
	for (let i = 0; i < assignments.length; i++) {
		const a = assignments[i];
		if (noShowSet.has(i)) continue;
		if ((a.status === 'cancelled' || a.status === 'unfilled') && !isPastDate(a.date)) {
			openCandidateIndices.push(i);
		}
	}
	// Shuffle and take only maxOpenWindows
	for (let i = openCandidateIndices.length - 1; i > 0; i--) {
		const j = randomInt(0, i + 1);
		[openCandidateIndices[i], openCandidateIndices[j]] = [
			openCandidateIndices[j],
			openCandidateIndices[i]
		];
	}
	const selectedOpenIndices = new Set(openCandidateIndices.slice(0, maxOpenWindows));

	// --- Standard bid windows ---
	for (let i = 0; i < assignments.length; i++) {
		const assignment = assignments[i];

		if (noShowSet.has(i)) continue;

		if (assignment.status !== 'cancelled' && assignment.status !== 'unfilled') {
			continue;
		}

		const isPast = isPastDate(assignment.date);
		const isFuture = isFutureDate(assignment.date);

		if (!isPast && !selectedOpenIndices.has(i)) {
			continue;
		}

		let opensAt: Date;
		let closesAt: Date;

		if (isFuture) {
			const daysBeforeNow = 1 + randomInt(0, 5);
			opensAt = subDays(getSeedNow(), daysBeforeNow);
			closesAt = subHours(new Date(assignment.date + 'T07:00:00'), 24);
		} else {
			opensAt = randomTimeOnDate(assignment.date, 6, 8);
			closesAt = addHours(opensAt, 4);
		}

		let mode: GeneratedBidWindow['mode'];
		if (isFuture) {
			const hoursToShift =
				(new Date(assignment.date + 'T07:00:00').getTime() - getSeedNow().getTime()) /
				(1000 * 60 * 60);
			mode =
				hoursToShift > dispatchPolicy.bidding.instantModeCutoffHours
					? 'competitive'
					: 'instant';
		} else {
			mode = 'competitive';
		}

		const shouldHaveNoBids = !isPast && i % 7 === 0;
		const maxBids = isPast ? 9 : 4;
		const minBids = isPast ? 3 : 0;
		const numBids = shouldHaveNoBids ? 0 : randomInt(minBids, maxBids);

		const availableBidders = eligibleDrivers.filter((d) => {
			if (isPast) return true;
			const dates = driverDateBids.get(d.id);
			return !dates || !dates.has(assignment.date);
		});

		const bidders = numBids === 0 ? [] : selectRandomDrivers(availableBidders, numBids);

		const bidScores: Array<{ userId: string; score: number }> = bidders.map((driver) => ({
			userId: driver.id,
			score: computeDriverBidScore(
				driver.id,
				assignment.routeId,
				healthByUser,
				completionsByUserRoute,
				prefByUser,
				tenureByUser,
				!!context
			)
		}));

		bidScores.sort((a, b) => b.score - a.score);
		const winnerId = isPast && bidScores.length > 0 ? bidScores[0].userId : null;

		let windowStatus: 'open' | 'closed' | 'resolved';
		if (isPast) {
			windowStatus = winnerId ? 'resolved' : 'closed';
		} else {
			windowStatus = 'open';
		}

		bidWindows.push({
			assignmentIndex: i,
			opensAt,
			closesAt,
			status: windowStatus,
			winnerId,
			mode,
			trigger: null,
			payBonusPercent: 0
		});

		createBidsForWindow(
			bids,
			bidScores,
			i,
			isPast,
			isFuture,
			winnerId,
			opensAt,
			closesAt,
			assignment.date,
			driverDateBids
		);
	}

	// --- Emergency bid windows for no-shows ---
	for (const noShowIdx of noShowIndices) {
		const assignment = assignments[noShowIdx];
		const opensAt = randomTimeOnDate(assignment.date, 9, 10);
		const closesAt = randomTimeOnDate(assignment.date, 18, 20);

		const numBids = randomInt(1, 4);
		const availableBidders = eligibleDrivers.filter(
			(d) => d.id !== assignment.userId
		);
		const bidders = selectRandomDrivers(availableBidders, numBids);

		const bidScores: Array<{ userId: string; score: number }> = bidders.map((driver) => ({
			userId: driver.id,
			score: computeDriverBidScore(
				driver.id,
				assignment.routeId,
				healthByUser,
				completionsByUserRoute,
				prefByUser,
				tenureByUser,
				!!context
			)
		}));
		bidScores.sort((a, b) => b.score - a.score);
		const winnerId = bidScores.length > 0 ? bidScores[0].userId : null;

		bidWindows.push({
			assignmentIndex: noShowIdx,
			opensAt,
			closesAt,
			status: winnerId ? 'resolved' : 'closed',
			winnerId,
			mode: 'emergency',
			trigger: 'no_show',
			payBonusPercent: dispatchPolicy.bidding.emergencyBonusPercent
		});

		createBidsForWindow(
			bids,
			bidScores,
			noShowIdx,
			true,
			false,
			winnerId,
			opensAt,
			closesAt,
			assignment.date,
			driverDateBids
		);
	}

	return { bidWindows, bids };
}

/**
 * Compute bid score using the real formula from dispatchPolicy.
 * Falls back to random generation if no context is provided.
 */
function computeDriverBidScore(
	driverId: string,
	routeId: string,
	healthByUser: Map<string, GeneratedHealthState>,
	completionsByUserRoute: Map<string, number>,
	prefByUser: Map<string, GeneratedPreference>,
	tenureByUser: Map<string, number>,
	hasContext: boolean
): number {
	if (!hasContext) {
		// Fallback: random composite score (for backward compatibility)
		const health = 0.3 + random() * 0.7;
		const routeFamiliarity = random();
		const seniority = random();
		const preferenceBonus = random() < 0.3 ? 1 : 0;
		const score =
			health * 0.45 + routeFamiliarity * 0.25 + seniority * 0.15 + preferenceBonus * 0.15;
		return Math.round(score * 100) / 100;
	}

	const healthState = healthByUser.get(driverId);
	const healthScore = healthState?.currentScore ?? 50;
	const routeFamiliarityCount =
		completionsByUserRoute.get(`${driverId}:${routeId}`) ?? 0;
	const tenureMonths = tenureByUser.get(driverId) ?? 0;
	const pref = prefByUser.get(driverId);
	const preferredRouteIds = pref?.preferredRoutes ?? [];

	const parts = calculateBidScoreParts({
		healthScore,
		routeFamiliarityCount,
		tenureMonths,
		preferredRouteIds,
		routeId
	});

	return Math.round(parts.total * 100) / 100;
}

function createBidsForWindow(
	bids: GeneratedBid[],
	bidScores: Array<{ userId: string; score: number }>,
	assignmentIndex: number,
	isPast: boolean,
	isFuture: boolean,
	winnerId: string | null,
	opensAt: Date,
	closesAt: Date,
	assignmentDate: string,
	driverDateBids: Map<string, Set<string>>
): void {
	for (const bidScore of bidScores) {
		let bidStatus: 'pending' | 'won' | 'lost';
		let resolvedAt: Date | null = null;

		if (isPast) {
			if (bidScore.userId === winnerId) {
				bidStatus = 'won';
				resolvedAt = closesAt;
			} else {
				bidStatus = 'lost';
				resolvedAt = closesAt;
			}
		} else {
			bidStatus = 'pending';

			let dates = driverDateBids.get(bidScore.userId);
			if (!dates) {
				dates = new Set();
				driverDateBids.set(bidScore.userId, dates);
			}
			dates.add(assignmentDate);
		}

		let bidAt: Date;
		if (isFuture) {
			const now = getSeedNow();
			bidAt = new Date(opensAt.getTime() + random() * (now.getTime() - opensAt.getTime()));
		} else {
			bidAt = randomBidTime(opensAt, closesAt);
		}

		bids.push({
			assignmentIndex,
			userId: bidScore.userId,
			score: bidScore.score,
			status: bidStatus,
			bidAt,
			windowClosesAt: closesAt,
			resolvedAt
		});
	}
}

function selectRandomDrivers(drivers: GeneratedUser[], count: number): GeneratedUser[] {
	const shuffled = [...drivers];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = randomInt(0, i + 1);
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled.slice(0, Math.min(count, drivers.length));
}

function randomBidTime(opensAt: Date, closesAt: Date): Date {
	const range = closesAt.getTime() - opensAt.getTime();
	return new Date(opensAt.getTime() + random() * range);
}
