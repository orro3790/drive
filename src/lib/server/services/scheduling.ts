/**
 * Schedule Generation Service
 *
 * Implements the automatic schedule generation algorithm that runs at preference lock time.
 * See documentation/specs/SPEC.md § Scheduling System for full specification.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	driverPreferences,
	driverMetrics,
	organizations,
	routeCompletions,
	routes,
	user,
	warehouses
} from '$lib/server/db/schema';
import { and, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import logger from '$lib/server/logger';
import { createAuditLog } from '$lib/server/services/audit';
import {
	addDaysToDateString,
	getDayOfWeekFromDateString,
	getTorontoDateTimeInstant,
	getTorontoWeekStartDateString
} from '$lib/server/time/toronto';

/**
 * Get the start of a week (Monday) in Toronto timezone
 */
export function getWeekStart(date: Date): Date {
	const weekStartDate = getTorontoWeekStartDateString(date);
	return getTorontoDateTimeInstant(weekStartDate, { hours: 0 });
}

/**
 * Resolve the Toronto week start instant for a date-only string.
 */
export function getWeekStartForDateString(dateString: string): Date {
	const assignmentInstant = getTorontoDateTimeInstant(dateString, { hours: 0 });
	return getWeekStart(assignmentInstant);
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
	targetWeekStart: Date,
	organizationId?: string
): Promise<ScheduleGenerationResult> {
	if (organizationId) {
		return generateWeekScheduleForOrganization(targetWeekStart, organizationId);
	}

	const organizationRows = await db.select({ id: organizations.id }).from(organizations);

	if (organizationRows.length === 0) {
		return {
			created: 0,
			skipped: 0,
			unfilled: 0,
			errors: []
		};
	}

	const aggregate: ScheduleGenerationResult = {
		created: 0,
		skipped: 0,
		unfilled: 0,
		errors: []
	};

	for (const org of organizationRows) {
		const scopedResult = await generateWeekScheduleForOrganization(targetWeekStart, org.id);
		aggregate.created += scopedResult.created;
		aggregate.skipped += scopedResult.skipped;
		aggregate.unfilled += scopedResult.unfilled;
		aggregate.errors.push(...scopedResult.errors.map((message) => `[${org.id}] ${message}`));
	}

	return aggregate;
}

async function generateWeekScheduleForOrganization(
	targetWeekStart: Date,
	organizationId: string
): Promise<ScheduleGenerationResult> {
	if (!organizationId) {
		return {
			created: 0,
			skipped: 0,
			unfilled: 0,
			errors: []
		};
	}

	const log = logger.child({ operation: 'generateWeekSchedule', targetWeekStart, organizationId });
	const result: ScheduleGenerationResult = {
		created: 0,
		skipped: 0,
		unfilled: 0,
		errors: []
	};

	// Normalize to start of Monday in Toronto
	const weekStartDate = getTorontoWeekStartDateString(targetWeekStart);
	const weekEndDate = addDaysToDateString(weekStartDate, 7);

	log.info({ weekStartDate, weekEndDate }, 'Starting schedule generation');

	// Get all routes
	const allRoutes = await db
		.select({ id: routes.id, warehouseId: routes.warehouseId })
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(eq(warehouses.organizationId, organizationId));

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
		.where(
			and(
				eq(user.role, 'driver'),
				eq(user.isFlagged, false),
				eq(user.organizationId, organizationId)
			)
		);

	if (eligibleDrivers.length === 0) {
		log.warn('No eligible drivers found');
	}

	// Get all driver preferences
	const eligibleDriverIds = eligibleDrivers.map((driver) => driver.id);
	const allPreferences =
		eligibleDriverIds.length > 0
			? await db
					.select()
					.from(driverPreferences)
					.where(inArray(driverPreferences.userId, eligibleDriverIds))
			: [];
	const preferencesByUser = new Map(allPreferences.map((p) => [p.userId, p]));

	// Get all driver metrics
	const allMetrics =
		eligibleDriverIds.length > 0
			? await db
					.select()
					.from(driverMetrics)
					.where(inArray(driverMetrics.userId, eligibleDriverIds))
			: [];
	const metricsByUser = new Map(allMetrics.map((m) => [m.userId, m]));

	// Get all route completion counts
	const allRouteIds = allRoutes.map((route) => route.id);
	const allCompletions =
		eligibleDriverIds.length > 0 && allRouteIds.length > 0
			? await db
					.select()
					.from(routeCompletions)
					.where(
						and(
							inArray(routeCompletions.userId, eligibleDriverIds),
							inArray(routeCompletions.routeId, allRouteIds)
						)
					)
			: [];
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
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(warehouses.organizationId, organizationId),
				gte(assignments.date, weekStartDate),
				lt(assignments.date, weekEndDate),
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
		const dateString = addDaysToDateString(weekStartDate, dayOffset);
		const dayOfWeek = getDayOfWeekFromDateString(dateString);

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
					const assignedAt = new Date();
					const [created] = await db
						.insert(assignments)
						.values({
							routeId: route.id,
							userId: winner.userId,
							warehouseId: route.warehouseId,
							date: dateString,
							status: 'scheduled',
							assignedBy: 'algorithm',
							assignedAt
						})
						.returning({ id: assignments.id });

					await createAuditLog({
						entityType: 'assignment',
						entityId: created.id,
						action: 'create',
						actorType: 'system',
						actorId: null,
						changes: {
							after: {
								status: 'scheduled',
								userId: winner.userId,
								routeId: route.id,
								warehouseId: route.warehouseId,
								date: dateString,
								assignedBy: 'algorithm',
								assignedAt
							}
						}
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
					const assignedAt = new Date();
					const [created] = await db
						.insert(assignments)
						.values({
							routeId: route.id,
							userId: null,
							warehouseId: route.warehouseId,
							date: dateString,
							status: 'unfilled',
							assignedBy: 'algorithm',
							assignedAt
						})
						.returning({ id: assignments.id });

					await createAuditLog({
						entityType: 'assignment',
						entityId: created.id,
						action: 'create',
						actorType: 'system',
						actorId: null,
						changes: {
							after: {
								status: 'unfilled',
								userId: null,
								routeId: route.id,
								warehouseId: route.warehouseId,
								date: dateString,
								assignedBy: 'algorithm',
								assignedAt
							}
						}
					});

					result.unfilled++;
					log.debug({ routeId: route.id, date: dateString }, 'Unfilled assignment created');
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				result.errors.push(`Route ${route.id} on ${dateString}: ${message}`);
				log.error(
					{ routeId: route.id, date: dateString, error: message },
					'Failed to create assignment'
				);
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
	weekStart: Date,
	organizationId?: string
): Promise<number> {
	const resolvedOrganizationId =
		organizationId ?? (await resolveUserOrganizationId(userId)) ?? undefined;

	if (!resolvedOrganizationId) {
		return 0;
	}

	const weekStartDate = getTorontoWeekStartDateString(weekStart);
	const weekEndDate = addDaysToDateString(weekStartDate, 7);

	const [result] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.userId, userId),
				eq(warehouses.organizationId, resolvedOrganizationId),
				gte(assignments.date, weekStartDate),
				lt(assignments.date, weekEndDate),
				ne(assignments.status, 'cancelled')
			)
		);

	return result?.count ?? 0;
}

/**
 * Check if a driver can take an additional assignment in the given week.
 */
export async function canDriverTakeAssignment(
	userId: string,
	weekStart: Date,
	organizationId?: string
): Promise<boolean> {
	const resolvedOrganizationId =
		organizationId ?? (await resolveUserOrganizationId(userId)) ?? undefined;
	if (!resolvedOrganizationId) {
		return false;
	}

	// Get user info
	const [userInfo] = await db
		.select({ weeklyCap: user.weeklyCap, isFlagged: user.isFlagged })
		.from(user)
		.where(and(eq(user.id, userId), eq(user.organizationId, resolvedOrganizationId)));

	if (!userInfo || userInfo.isFlagged) {
		return false;
	}

	const currentCount = await getDriverWeeklyAssignmentCount(
		userId,
		weekStart,
		resolvedOrganizationId
	);
	return currentCount < userInfo.weeklyCap;
}

async function resolveUserOrganizationId(userId: string): Promise<string | null> {
	const [userRecord] = await db
		.select({ organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	return userRecord?.organizationId ?? null;
}
