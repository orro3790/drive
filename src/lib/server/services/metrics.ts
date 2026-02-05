/**
 * Driver Metrics Service
 *
 * Recalculates attendance/completion rates and tracks route familiarity.
 */

import { db } from '$lib/server/db';
import { assignments, driverMetrics, routeCompletions, shifts } from '$lib/server/db/schema';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';

export async function updateDriverMetrics(userId: string): Promise<void> {
	const [totalResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.where(eq(assignments.userId, userId));

	const totalShifts = totalResult?.count ?? 0;

	const [completedResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(shifts)
		.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
		.where(and(eq(assignments.userId, userId), isNotNull(shifts.completedAt)));

	const completedShifts = completedResult?.count ?? 0;

	const [completionResult] = await db
		.select({
			average: sql<number>`avg(${shifts.parcelsDelivered}::float / ${shifts.parcelsStart})`
		})
		.from(shifts)
		.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
		.where(
			and(
				eq(assignments.userId, userId),
				isNotNull(shifts.completedAt),
				isNotNull(shifts.parcelsStart),
				ne(shifts.parcelsStart, 0)
			)
		);

	const [avgParcelsResult] = await db
		.select({
			average: sql<number>`avg(${shifts.parcelsDelivered}::float)`
		})
		.from(shifts)
		.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
		.where(
			and(
				eq(assignments.userId, userId),
				isNotNull(shifts.completedAt),
				isNotNull(shifts.parcelsDelivered)
			)
		);

	const completionRate = completionResult?.average ?? 0;
	const avgParcelsDelivered = avgParcelsResult?.average ?? 0;
	const attendanceRate = totalShifts > 0 ? completedShifts / totalShifts : 0;
	const updatedAt = new Date();

	await db
		.insert(driverMetrics)
		.values({
			userId,
			totalShifts,
			completedShifts,
			attendanceRate,
			completionRate,
			avgParcelsDelivered,
			updatedAt
		})
		.onConflictDoUpdate({
			target: driverMetrics.userId,
			set: {
				totalShifts,
				completedShifts,
				attendanceRate,
				completionRate,
				avgParcelsDelivered,
				updatedAt
			}
		});
}

interface RouteCompletionInput {
	userId: string;
	routeId: string;
	completedAt: Date;
}

export async function recordRouteCompletion({
	userId,
	routeId,
	completedAt
}: RouteCompletionInput): Promise<void> {
	await db
		.insert(routeCompletions)
		.values({
			userId,
			routeId,
			completionCount: 1,
			lastCompletedAt: completedAt
		})
		.onConflictDoUpdate({
			target: [routeCompletions.userId, routeCompletions.routeId],
			set: {
				completionCount: sql<number>`case when ${routeCompletions.lastCompletedAt} is null or ${routeCompletions.lastCompletedAt} < excluded.last_completed_at then ${routeCompletions.completionCount} + 1 else ${routeCompletions.completionCount} end`,
				lastCompletedAt: sql<Date>`greatest(coalesce(${routeCompletions.lastCompletedAt}, excluded.last_completed_at), excluded.last_completed_at)`
			}
		});
}
