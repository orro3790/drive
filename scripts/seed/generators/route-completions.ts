/**
 * Route Completions Generator
 *
 * Creates route familiarity data based on completed assignments.
 * This is used for bid scoring - more completions = higher familiarity.
 */

import type { GeneratedAssignment } from './assignments';

export interface GeneratedRouteCompletion {
	userId: string;
	routeId: string;
	completionCount: number;
	lastCompletedAt: Date;
}

/**
 * Generate route completions from completed assignments.
 */
export function generateRouteCompletions(
	assignments: GeneratedAssignment[]
): GeneratedRouteCompletion[] {
	// Aggregate completions by user+route
	const completionMap = new Map<string, { count: number; lastDate: string }>();

	for (const assignment of assignments) {
		if (assignment.status !== 'completed' || !assignment.userId) continue;

		const key = `${assignment.userId}:${assignment.routeId}`;
		const existing = completionMap.get(key);

		if (existing) {
			existing.count++;
			if (assignment.date > existing.lastDate) {
				existing.lastDate = assignment.date;
			}
		} else {
			completionMap.set(key, { count: 1, lastDate: assignment.date });
		}
	}

	// Convert to output format
	const completions: GeneratedRouteCompletion[] = [];

	for (const [key, data] of completionMap) {
		const [userId, routeId] = key.split(':');
		completions.push({
			userId,
			routeId,
			completionCount: data.count,
			lastCompletedAt: new Date(data.lastDate)
		});
	}

	return completions;
}
