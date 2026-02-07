/**
 * Preferences Generator
 *
 * Creates driver preferences with realistic day and route selections.
 */

import type { GeneratedUser } from './users';
import { random, randomInt } from '../utils/runtime';

export interface GeneratedPreference {
	userId: string;
	preferredDays: number[]; // 0=Sunday, 1=Monday, etc.
	preferredRoutes: string[]; // Route UUIDs
}

/**
 * Generate preferences for drivers.
 * Each driver gets 3-6 preferred days and 1-3 preferred routes.
 */
export function generatePreferences(
	drivers: GeneratedUser[],
	routeIds: string[]
): GeneratedPreference[] {
	const preferences: GeneratedPreference[] = [];

	for (const driver of drivers) {
		if (driver.role !== 'driver') continue;

		// Generate 3-6 preferred days (weighted toward weekdays)
		const numDays = 3 + randomInt(0, 4);
		const preferredDays = selectPreferredDays(numDays);

		// Generate 1-3 preferred routes
		const numRoutes = 1 + randomInt(0, 3);
		const preferredRoutes = selectRandomItems(routeIds, numRoutes);

		preferences.push({
			userId: driver.id,
			preferredDays,
			preferredRoutes
		});
	}

	return preferences;
}

/**
 * Select preferred days with realistic distribution.
 * Weekdays (Mon-Fri) are more commonly preferred than weekends.
 */
function selectPreferredDays(count: number): number[] {
	// Day weights: Mon-Fri higher than Sat-Sun
	const dayWeights = [
		{ day: 0, weight: 2 }, // Sunday
		{ day: 1, weight: 5 }, // Monday
		{ day: 2, weight: 5 }, // Tuesday
		{ day: 3, weight: 5 }, // Wednesday
		{ day: 4, weight: 5 }, // Thursday
		{ day: 5, weight: 5 }, // Friday
		{ day: 6, weight: 3 } // Saturday
	];

	const selected = new Set<number>();
	const totalWeight = dayWeights.reduce((sum, d) => sum + d.weight, 0);

	while (selected.size < count && selected.size < 7) {
		let weightedRoll = random() * totalWeight;
		for (const { day, weight } of dayWeights) {
			weightedRoll -= weight;
			if (weightedRoll <= 0 && !selected.has(day)) {
				selected.add(day);
				break;
			}
		}
		// Fallback: if weighted selection didn't add (due to duplicates), add random
		if (selected.size < count) {
			const remaining = dayWeights.filter((d) => !selected.has(d.day));
			if (remaining.length > 0) {
				const pick = remaining[randomInt(0, remaining.length)];
				selected.add(pick.day);
			}
		}
	}

	return Array.from(selected).sort((a, b) => a - b);
}

/**
 * Select random items from an array without duplicates.
 */
function selectRandomItems<T>(items: T[], count: number): T[] {
	const shuffled = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = randomInt(0, i + 1);
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled.slice(0, Math.min(count, items.length));
}
