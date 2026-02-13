/**
 * Driver Metrics Service
 *
 * Recalculates attendance/completion rates and tracks route familiarity.
 */

import { db } from '$lib/server/db';
import {
	assignments,
	driverMetrics,
	routeCompletions,
	routes,
	shifts,
	user,
	warehouses
} from '$lib/server/db/schema';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';

async function resolveMetricsOrganizationId(
	userId: string,
	organizationId?: string
): Promise<string | null> {
	if (organizationId) {
		return organizationId;
	}

	const [driver] = await db
		.select({ organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	return driver?.organizationId ?? null;
}

export async function updateDriverMetrics(userId: string, organizationId?: string): Promise<void> {
	const resolvedOrganizationId = await resolveMetricsOrganizationId(userId, organizationId);
	if (!resolvedOrganizationId) {
		return;
	}

	const [totalResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assignments)
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(eq(assignments.userId, userId), eq(warehouses.organizationId, resolvedOrganizationId))
		);

	const totalShifts = totalResult?.count ?? 0;

	const [completedResult] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(shifts)
		.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.userId, userId),
				eq(warehouses.organizationId, resolvedOrganizationId),
				isNotNull(shifts.completedAt)
			)
		);

	const completedShifts = completedResult?.count ?? 0;

	// Adjusted completion rate: (parcelsStart - parcelsReturned + exceptedReturns) / parcelsStart
	const [completionResult] = await db
		.select({
			average: sql<number>`avg((${shifts.parcelsStart} - coalesce(${shifts.parcelsReturned}, 0) + coalesce(${shifts.exceptedReturns}, 0))::float / ${shifts.parcelsStart})`
		})
		.from(shifts)
		.innerJoin(assignments, eq(assignments.id, shifts.assignmentId))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.userId, userId),
				eq(warehouses.organizationId, resolvedOrganizationId),
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
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.userId, userId),
				eq(warehouses.organizationId, resolvedOrganizationId),
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
	organizationId?: string;
}

export async function recordRouteCompletion({
	userId,
	routeId,
	completedAt,
	organizationId
}: RouteCompletionInput): Promise<void> {
	const resolvedOrganizationId = await resolveMetricsOrganizationId(userId, organizationId);
	if (!resolvedOrganizationId) {
		return;
	}

	const [scopedRoute] = await db
		.select({ id: routes.id })
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(and(eq(routes.id, routeId), eq(warehouses.organizationId, resolvedOrganizationId)))
		.limit(1);

	if (!scopedRoute) {
		return;
	}

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
