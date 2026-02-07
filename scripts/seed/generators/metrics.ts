/**
 * Metrics Generator
 *
 * Creates driver metrics with realistic performance distributions.
 * - 70% high performers (85-100% rates)
 * - 20% medium (70-85%)
 * - 10% low (<70%)
 */

import type { GeneratedUser } from './users';
import { random, randomInt } from '../utils/runtime';

export interface GeneratedMetric {
	userId: string;
	totalShifts: number;
	completedShifts: number;
	attendanceRate: number;
	completionRate: number;
}

/**
 * Generate metrics for drivers with realistic distribution.
 */
export function generateMetrics(drivers: GeneratedUser[]): GeneratedMetric[] {
	const metrics: GeneratedMetric[] = [];

	for (const driver of drivers) {
		if (driver.role !== 'driver') continue;

		// Determine performance tier
		const tier = selectPerformanceTier();

		// Generate total shifts (10-100 depending on how long they've been around)
		const totalShifts = 10 + randomInt(0, 90);

		// Generate rates based on tier
		const { attendanceRate, completionRate } = generateRatesForTier(tier);

		// Calculate completed shifts from attendance rate
		const completedShifts = Math.round(totalShifts * attendanceRate);

		metrics.push({
			userId: driver.id,
			totalShifts,
			completedShifts,
			attendanceRate,
			completionRate
		});
	}

	return metrics;
}

type PerformanceTier = 'high' | 'medium' | 'low';

function selectPerformanceTier(): PerformanceTier {
	const roll = random();
	if (roll < 0.7) return 'high';
	if (roll < 0.9) return 'medium';
	return 'low';
}

function generateRatesForTier(tier: PerformanceTier): {
	attendanceRate: number;
	completionRate: number;
} {
	switch (tier) {
		case 'high':
			return {
				attendanceRate: randomInRange(0.85, 1.0),
				completionRate: randomInRange(0.9, 1.0)
			};
		case 'medium':
			return {
				attendanceRate: randomInRange(0.7, 0.85),
				completionRate: randomInRange(0.75, 0.9)
			};
		case 'low':
			return {
				attendanceRate: randomInRange(0.5, 0.7),
				completionRate: randomInRange(0.6, 0.75)
			};
	}
}

function randomInRange(min: number, max: number): number {
	return Math.round((min + random() * (max - min)) * 100) / 100;
}
