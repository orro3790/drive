/**
 * Bidding Generator
 *
 * Creates bid windows and bids for cancelled/unfilled assignments.
 * - Past closesAt → status='resolved', winnerId set
 * - Future closesAt → status='open'
 */

import { addHours } from 'date-fns';
import type { GeneratedAssignment } from './assignments';
import type { GeneratedUser } from './users';
import { isPastDate, randomTimeOnDate } from '../utils/dates';

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

	for (let i = 0; i < assignments.length; i++) {
		const assignment = assignments[i];

		// Only create bid windows for cancelled or unfilled assignments
		if (assignment.status !== 'cancelled' && assignment.status !== 'unfilled') {
			continue;
		}

		// Create bid window
		const opensAt = randomTimeOnDate(assignment.date, 6, 8);
		const closesAt = addHours(opensAt, 4); // 4-hour window
		const isPast = isPastDate(assignment.date);

		// Generate 3-8 bids from random eligible drivers
		const numBids = 3 + Math.floor(Math.random() * 6);
		const bidders = selectRandomDrivers(eligibleDrivers, numBids);

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
			}

			bids.push({
				assignmentIndex: i,
				userId: bidScore.userId,
				score: bidScore.score,
				status: bidStatus,
				bidAt: randomBidTime(opensAt, closesAt),
				windowClosesAt: closesAt,
				resolvedAt
			});
		}
	}

	return { bidWindows, bids };
}

function selectRandomDrivers(drivers: GeneratedUser[], count: number): GeneratedUser[] {
	const shuffled = [...drivers].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(count, drivers.length));
}

/**
 * Calculate a realistic bid score based on the scoring formula:
 * score = (completion_rate * 0.4) + (route_familiarity * 0.3) +
 *         (attendance_rate * 0.2) + (preference_bonus * 0.1)
 *
 * For seeding, we generate realistic composite scores.
 */
function calculateBidScore(): number {
	// Generate score components
	const completionRate = 0.7 + Math.random() * 0.3; // 70-100%
	const routeFamiliarity = Math.random(); // 0-100% normalized
	const attendanceRate = 0.7 + Math.random() * 0.3; // 70-100%
	const preferenceBonus = Math.random(); // 0-100%

	const score =
		completionRate * 0.4 + routeFamiliarity * 0.3 + attendanceRate * 0.2 + preferenceBonus * 0.1;

	return Math.round(score * 100) / 100;
}

function randomBidTime(opensAt: Date, closesAt: Date): Date {
	const range = closesAt.getTime() - opensAt.getTime();
	return new Date(opensAt.getTime() + Math.random() * range);
}
