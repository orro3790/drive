/**
 * Schedule Generation Service
 *
 * Implements the automatic schedule generation algorithm that runs at preference lock time.
 * See docs/specs/SPEC.md § Scheduling System for full specification.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	driverPreferences,
	driverMetrics,
	routeCompletions,
	routes,
	user
} from '$lib/server/db/schema';
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { toZonedTime, format } from 'date-fns-tz';
import { addDays, startOfDay } from 'date-fns';
import logger from '$lib/server/logger';

const TORONTO_TZ = 'America/Toronto';

/**
 * Get the start of a week (Monday) in Toronto timezone
 */
export function getWeekStart(date: Date): Date {
	const zonedDate = toZonedTime(date, TORONTO_TZ);
	const day = zonedDate.getDay();
	// Adjust to Monday (day 1). If Sunday (0), go back 6 days
	const diff = day === 0 ? -6 : 1 - day;
	const monday = addDays(zonedDate, diff);
	return startOfDay(monday);
}

/**
 * Convert a date to Toronto date string (YYYY-MM-DD)
 */
function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

/**
 * Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday) in Toronto timezone
 */
function getTorontoDayOfWeek(date: Date): number {
	return toZonedTime(date, TORONTO_TZ).getDay();
}

interface EligibleDriver {
	userId: string;
	familiarityCount: number;
	completionRate: number;
	attendanceRate: number;
}

interface ScheduleGenerationResult {
	created: number;
	skipped: number;
	unfilled: number;
	errors: string[];
}

/**
 * Generate the schedule for a target week.
 *
 * Algorithm:
 * 1. For each day in the target week (Mon-Sun)
 * 2. For each route that needs coverage
 * 3. Find eligible drivers:
 *    - Prefers this day
 *    - Prefers this route (in top 3)
 *    - Under weekly cap
 *    - Not flagged
 * 4. Sort by: route familiarity (desc) → completion rate (desc) → attendance rate (desc)
 * 5. Assign top driver, or create unfilled assignment if no eligible driver
 *
 * Idempotent: Checks for existing assignments before creating new ones.
 *
 * @param targetWeekStart - The Monday of the week to generate schedule for
 */
export async function generateWeekSchedule(
	targetWeekStart: Date
): Promise<ScheduleGenerationResult> {
	const log = logger.child({ operation: 'generateWeekSchedule', targetWeekStart });
	const result: ScheduleGenerationResult = {
		created: 0,
		skipped: 0,
		unfilled: 0,
		errors: []
	};

	// Normalize to start of Monday in Toronto
	const weekStart = getWeekStart(targetWeekStart);
	const weekEnd = addDays(weekStart, 7);

	log.info({ weekStart, weekEnd }, 'Starting schedule generation');

	// Get all routes
	const allRoutes = await db.select().from(routes);

	if (allRoutes.length === 0) {
		log.warn('No routes found, nothing to schedule');
		return result;
	}

	// Get all eligible drivers (not flagged)
	const eligibleDrivers = await db
		.select({
			id: user.id,
			weeklyCap: user.weeklyCap
		})
		.from(user)
		.where(and(eq(user.role, 'driver'), eq(user.isFlagged, false)));

	if (eligibleDrivers.length === 0) {
		log.warn('No eligible drivers found');
	}

	// Get all driver preferences
	const allPreferences = await db.select().from(driverPreferences);
	const preferencesByUser = new Map(allPreferences.map((p) => [p.userId, p]));

	// Get all driver metrics
	const allMetrics = await db.select().from(driverMetrics);
	const metricsByUser = new Map(allMetrics.map((m) => [m.userId, m]));

	// Get all route completion counts
	const allCompletions = await db.select().from(routeCompletions);
	const completionsByUserRoute = new Map(
		allCompletions.map((c) => [`${c.userId}:${c.routeId}`, c.completionCount])
	);

	// Track assignments per driver for this week to respect weekly cap
	const weeklyAssignmentCount = new Map<string, number>();

	// Get existing assignments for this week to pre-populate counts
	const existingAssignments = await db
		.select({
			userId: assignments.userId,
			routeId: assignments.routeId,
			date: assignments.date
		})
		.from(assignments)
		.where(
			and(
				gte(assignments.date, toTorontoDateString(weekStart)),
				lt(assignments.date, toTorontoDateString(weekEnd)),
				ne(assignments.status, 'cancelled')
			)
		);

	// Build set of existing route-date combinations (for idempotency)
	const existingRouteDates = new Set(existingAssignments.map((a) => `${a.routeId}:${a.date}`));

	// Pre-populate weekly assignment counts from existing assignments
	for (const assignment of existingAssignments) {
		if (assignment.userId) {
			const count = weeklyAssignmentCount.get(assignment.userId) || 0;
			weeklyAssignmentCount.set(assignment.userId, count + 1);
		}
	}

	// Process each day of the week (Monday through Sunday)
	for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
		const currentDate = addDays(weekStart, dayOffset);
		const dateString = toTorontoDateString(currentDate);
		const dayOfWeek = getTorontoDayOfWeek(currentDate);

		log.debug({ date: dateString, dayOfWeek }, 'Processing day');

		// Process each route
		for (const route of allRoutes) {
			const routeDateKey = `${route.id}:${dateString}`;

			// Idempotency check: skip if assignment already exists for this route-date
			if (existingRouteDates.has(routeDateKey)) {
				result.skipped++;
				continue;
			}

			// Find eligible drivers for this route on this day
			const candidates: EligibleDriver[] = [];

			for (const driver of eligibleDrivers) {
				const prefs = preferencesByUser.get(driver.id);
				const metrics = metricsByUser.get(driver.id);

				// Check if driver prefers this day
				if (!prefs || !prefs.preferredDays.includes(dayOfWeek)) {
					continue;
				}

				// Check if driver prefers this route (in top 3)
				if (!prefs.preferredRoutes.includes(route.id)) {
					continue;
				}

				// Check weekly cap
				const currentCount = weeklyAssignmentCount.get(driver.id) || 0;
				if (currentCount >= driver.weeklyCap) {
					continue;
				}

				// Driver is eligible
				candidates.push({
					userId: driver.id,
					familiarityCount: completionsByUserRoute.get(`${driver.id}:${route.id}`) || 0,
					completionRate: metrics?.completionRate || 0,
					attendanceRate: metrics?.attendanceRate || 0
				});
			}

			// Sort candidates: familiarity (desc) → completion rate (desc) → attendance rate (desc)
			candidates.sort((a, b) => {
				if (b.familiarityCount !== a.familiarityCount) {
					return b.familiarityCount - a.familiarityCount;
				}
				if (b.completionRate !== a.completionRate) {
					return b.completionRate - a.completionRate;
				}
				return b.attendanceRate - a.attendanceRate;
			});

			try {
				if (candidates.length > 0) {
					// Assign top candidate
					const winner = candidates[0];
					await db.insert(assignments).values({
						routeId: route.id,
						userId: winner.userId,
						warehouseId: route.warehouseId,
						date: dateString,
						status: 'scheduled',
						assignedBy: 'algorithm',
						assignedAt: new Date()
					});

					// Update weekly count for this driver
					const count = weeklyAssignmentCount.get(winner.userId) || 0;
					weeklyAssignmentCount.set(winner.userId, count + 1);

					result.created++;
					log.debug(
						{ routeId: route.id, userId: winner.userId, date: dateString },
						'Assignment created'
					);
				} else {
					// No eligible driver - create unfilled assignment
					await db.insert(assignments).values({
						routeId: route.id,
						userId: null,
						warehouseId: route.warehouseId,
						date: dateString,
						status: 'unfilled',
						assignedBy: 'algorithm',
						assignedAt: new Date()
					});

					result.unfilled++;
					log.debug({ routeId: route.id, date: dateString }, 'Unfilled assignment created');
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				result.errors.push(`Route ${route.id} on ${dateString}: ${message}`);
				log.error({ routeId: route.id, date: dateString, error: message }, 'Failed to create assignment');
			}
		}
	}

	log.info(
		{
			created: result.created,
			skipped: result.skipped,
			unfilled: result.unfilled,
			errorCount: result.errors.length
		},
		'Schedule generation complete'
	);

	return result;
}

/**
 * Get the count of non-cancelled assignments for a driver in a given week.
 */
export async function getDriverWeeklyAssignmentCount(
	userId: string,
	weekStart: Date
): Promise<number> {
	const weekStartNormalized = getWeekStart(weekStart);
	const weekEnd = addDays(weekStartNormalized, 7);

	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(
			and(
				eq(assignments.userId, userId),
				gte(assignments.date, toTorontoDateString(weekStartNormalized)),
				lt(assignments.date, toTorontoDateString(weekEnd)),
				ne(assignments.status, 'cancelled')
			)
		);

	return result?.count ?? 0;
}

/**
 * Check if a driver can take an additional assignment in the given week.
 */
export async function canDriverTakeAssignment(userId: string, weekStart: Date): Promise<boolean> {
	// Get user info
	const [userInfo] = await db
		.select({ weeklyCap: user.weeklyCap, isFlagged: user.isFlagged })
		.from(user)
		.where(eq(user.id, userId));

	if (!userInfo || userInfo.isFlagged) {
		return false;
	}

	const currentCount = await getDriverWeeklyAssignmentCount(userId, weekStart);
	return currentCount < userInfo.weeklyCap;
}
