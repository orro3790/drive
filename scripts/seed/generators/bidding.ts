/**
 * Bidding Generator
 *
 * Creates bid windows and bids for cancelled/unfilled assignments.
 * - Past closesAt → status='resolved', winnerId set
 * - Future closesAt → status='open'
 */

import { addHours, subDays, subHours } from 'date-fns';
import type { GeneratedAssignment } from './assignments';
import type { GeneratedUser } from './users';
import { isPastDate, isFutureDate, randomTimeOnDate } from '../utils/dates';
import { random, randomInt, getSeedNow } from '../utils/runtime';

export interface GeneratedBidWindow {
	assignmentIndex: number;
	opensAt: Date;
	closesAt: Date;
	status: 'open' | 'closed' | 'resolved';
	winnerId: string | null;
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

/**
 * Generate bid windows and bids for cancelled/unfilled assignments.
 */
export function generateBidding(
	assignments: GeneratedAssignment[],
	drivers: GeneratedUser[]
): GeneratedBiddingResult {
	const bidWindows: GeneratedBidWindow[] = [];
	const bids: GeneratedBid[] = [];

	// Get eligible drivers for bidding
	const eligibleDrivers = drivers.filter((d) => d.role === 'driver' && !d.isFlagged);

	if (eligibleDrivers.length === 0) {
		return { bidWindows, bids };
	}

	// Track per-driver-per-date bids to enforce max 1 pending bid per driver per date
	const driverDateBids = new Map<string, Set<string>>();

	// Limit future open bid windows to a realistic count (3-5).
	// In practice, most shifts are covered — open windows are rare drop/cancel events.
	const maxOpenWindows = 3 + randomInt(0, 3);
	let openWindowCount = 0;

	// Collect indices of non-past biddable assignments (today + future) for open window limiting
	const openCandidateIndices: number[] = [];
	for (let i = 0; i < assignments.length; i++) {
		const a = assignments[i];
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

	for (let i = 0; i < assignments.length; i++) {
		const assignment = assignments[i];

		// Only create bid windows for cancelled or unfilled assignments
		if (assignment.status !== 'cancelled' && assignment.status !== 'unfilled') {
			continue;
		}

		const isPast = isPastDate(assignment.date);
		const isFuture = isFutureDate(assignment.date);

		// Skip non-past assignments not selected for open windows
		if (!isPast && !selectedOpenIndices.has(i)) {
			continue;
		}

		// Calculate opensAt/closesAt based on past vs future
		let opensAt: Date;
		let closesAt: Date;

		if (isFuture) {
			// Future windows: opensAt is 1-5 days before now (when cancellation happened)
			const daysBeforeNow = 1 + randomInt(0, 5);
			opensAt = subDays(getSeedNow(), daysBeforeNow);
			// closesAt = 24h before 7AM shift start
			closesAt = subHours(new Date(assignment.date + 'T07:00:00'), 24);
		} else {
			// Past windows: opensAt is morning of the assignment date
			opensAt = randomTimeOnDate(assignment.date, 6, 8);
			closesAt = addHours(opensAt, 4);
		}

		// Generate bids — fewer for future windows
		const shouldHaveNoBids = !isPast && i % 7 === 0;
		const maxBids = isPast ? 9 : 4; // 3-8 for past, 0-3 for today/future
		const minBids = isPast ? 3 : 0;
		const numBids = shouldHaveNoBids ? 0 : randomInt(minBids, maxBids);

		// Filter out drivers who already have a pending bid for this date
		const availableBidders = eligibleDrivers.filter((d) => {
			if (isPast) return true; // Only enforce for pending (non-past) bids
			const dates = driverDateBids.get(d.id);
			return !dates || !dates.has(assignment.date);
		});

		const bidders = numBids === 0 ? [] : selectRandomDrivers(availableBidders, numBids);

		// Calculate scores and determine winner
		const bidScores: Array<{ userId: string; score: number }> = bidders.map((driver) => ({
			userId: driver.id,
			score: calculateBidScore()
		}));

		// Sort by score descending to find winner
		bidScores.sort((a, b) => b.score - a.score);
		const winnerId = isPast && bidScores.length > 0 ? bidScores[0].userId : null;

		// Determine window status
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
			winnerId
		});

		// Create individual bids
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

				// Track this driver-date combination for future bids
				let dates = driverDateBids.get(bidScore.userId);
				if (!dates) {
					dates = new Set();
					driverDateBids.set(bidScore.userId, dates);
				}
				dates.add(assignment.date);
			}

			// For future bids, bidAt should be between opensAt and now
			let bidAt: Date;
			if (isFuture) {
				const now = getSeedNow();
				bidAt = new Date(opensAt.getTime() + random() * (now.getTime() - opensAt.getTime()));
			} else {
				bidAt = randomBidTime(opensAt, closesAt);
			}

			bids.push({
				assignmentIndex: i,
				userId: bidScore.userId,
				score: bidScore.score,
				status: bidStatus,
				bidAt,
				windowClosesAt: closesAt,
				resolvedAt
			});
		}
	}

	return { bidWindows, bids };
}

function selectRandomDrivers(drivers: GeneratedUser[], count: number): GeneratedUser[] {
	const shuffled = [...drivers];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = randomInt(0, i + 1);
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled.slice(0, Math.min(count, drivers.length));
}

/**
 * Calculate a realistic bid score based on the new scoring formula:
 * score = (health * 0.45) + (familiarity * 0.25) +
 *         (seniority * 0.15) + (preference * 0.15)
 *
 * For seeding, we generate realistic composite scores.
 */
function calculateBidScore(): number {
	const health = 0.3 + random() * 0.7; // 0.3-1.0 (normalized health)
	const routeFamiliarity = random(); // 0-1.0 normalized
	const seniority = random(); // 0-1.0 normalized
	const preferenceBonus = random() < 0.3 ? 1 : 0; // ~30% chance of preference match

	const score = health * 0.45 + routeFamiliarity * 0.25 + seniority * 0.15 + preferenceBonus * 0.15;

	return Math.round(score * 100) / 100;
}

function randomBidTime(opensAt: Date, closesAt: Date): Date {
	const range = closesAt.getTime() - opensAt.getTime();
	return new Date(opensAt.getTime() + random() * range);
}
