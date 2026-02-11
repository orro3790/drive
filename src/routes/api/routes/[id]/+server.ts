/**
 * Route API - Update, Delete
 *
 * PATCH  /api/routes/[id] - Update a route
 * DELETE /api/routes/[id] - Delete a route (if no future assignments)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	assignments,
	bidWindows,
	routes,
	shifts,
	user,
	warehouses
} from '$lib/server/db/schema';
import { routeIdParamsSchema, routeUpdateSchema, type RouteStatus } from '$lib/schemas/route';
import { and, count, desc, eq, gt, ne } from 'drizzle-orm';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { createAuditLog } from '$lib/server/services/audit';
import {
	toLocalYmd,
	isValidDate,
	isShiftStarted,
	deriveShiftProgress
} from '$lib/server/services/routeHelpers';

type AssignmentDetails = {
	assignmentId: string;
	status: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled';
	driverName: string | null;
	bidWindowStatus: 'open' | null;
	bidWindowClosesAt: Date | null;
	confirmedAt: Date | null;
	arrivedAt: Date | null;
	startedAt: Date | null;
	completedAt: Date | null;
	cancelledAt: Date | null;
};

function resolveStatus(assignment: AssignmentDetails | null): RouteStatus {
	if (!assignment) return 'unfilled';
	if (assignment.status === 'unfilled') {
		return assignment.bidWindowStatus === 'open' ? 'bidding' : 'unfilled';
	}
	return 'assigned';
}

async function getRouteAssignmentDetails(
	routeId: string,
	date: string
): Promise<AssignmentDetails | null> {
	const [assignment] = await db
		.select({
			assignmentId: assignments.id,
			status: assignments.status,
			driverName: user.name,
			confirmedAt: assignments.confirmedAt,
			assignmentCancelledAt: assignments.cancelledAt,
			shiftArrivedAt: shifts.arrivedAt,
			shiftStartedAt: shifts.startedAt,
			shiftCompletedAt: shifts.completedAt
		})
		.from(assignments)
		.leftJoin(user, eq(user.id, assignments.userId))
		.leftJoin(shifts, eq(shifts.assignmentId, assignments.id))
		.where(and(eq(assignments.routeId, routeId), eq(assignments.date, date)));

	if (!assignment) {
		return null;
	}

	const [openWindow] = await db
		.select({ closesAt: bidWindows.closesAt })
		.from(bidWindows)
		.where(and(eq(bidWindows.assignmentId, assignment.assignmentId), eq(bidWindows.status, 'open')))
		.orderBy(desc(bidWindows.opensAt), desc(bidWindows.id))
		.limit(1);

	return {
		assignmentId: assignment.assignmentId,
		status: assignment.status,
		driverName: assignment.driverName,
		bidWindowStatus: openWindow ? 'open' : null,
		bidWindowClosesAt: openWindow?.closesAt ?? null,
		confirmedAt: assignment.confirmedAt,
		arrivedAt: assignment.shiftArrivedAt,
		startedAt: assignment.shiftStartedAt,
		completedAt: assignment.shiftCompletedAt,
		cancelledAt: assignment.assignmentCancelledAt
	};
}

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const paramsResult = routeIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid route ID');
	}

	const { id } = paramsResult.data;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = routeUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const [existing] = await db
		.select({
			id: routes.id,
			name: routes.name,
			startTime: routes.startTime,
			warehouseId: routes.warehouseId,
			warehouseName: warehouses.name,
			managerId: routes.managerId,
			createdAt: routes.createdAt,
			updatedAt: routes.updatedAt
		})
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(eq(routes.id, id));

	if (!existing) {
		throw error(404, 'Route not found');
	}

	// Validate manager has access to this route's warehouse
	const canAccess = await canManagerAccessWarehouse(locals.user.id, existing.warehouseId);
	if (!canAccess) {
		throw error(403, 'No access to this route');
	}

	const updates = result.data;
	const dateParam = url.searchParams.get('date');
	const date = dateParam || toLocalYmd();

	if (dateParam && !isValidDate(dateParam)) {
		throw error(400, 'Invalid date');
	}

	if (Object.keys(updates).length === 0) {
		const assignment = await getRouteAssignmentDetails(id, date);
		const status = resolveStatus(assignment);
		const shiftProgress = assignment
			? deriveShiftProgress(assignment, status, date, existing.startTime)
			: null;
		return json({
			route: {
				...existing,
				status,
				assignmentStatus: assignment?.status ?? null,
				isShiftStarted: isShiftStarted(date, existing.startTime),
				assignmentId: assignment?.assignmentId ?? null,
				driverName: status === 'assigned' ? (assignment?.driverName ?? null) : null,
				bidWindowClosesAt:
					status === 'bidding' ? (assignment?.bidWindowClosesAt?.toISOString() ?? null) : null,
				shiftProgress,
				confirmedAt: assignment?.confirmedAt?.toISOString() ?? null,
				arrivedAt: assignment?.arrivedAt?.toISOString() ?? null,
				startedAt: assignment?.startedAt?.toISOString() ?? null,
				completedAt: assignment?.completedAt?.toISOString() ?? null
			}
		});
	}

	const nextName = updates.name ?? existing.name;
	const nextWarehouseId = updates.warehouseId ?? existing.warehouseId;

	let nextWarehouseName = existing.warehouseName;
	if (updates.warehouseId && updates.warehouseId !== existing.warehouseId) {
		const canAccessTargetWarehouse = await canManagerAccessWarehouse(
			locals.user.id,
			updates.warehouseId
		);
		if (!canAccessTargetWarehouse) {
			throw error(403, 'No access to target warehouse');
		}

		const [warehouse] = await db
			.select({ id: warehouses.id, name: warehouses.name })
			.from(warehouses)
			.where(eq(warehouses.id, updates.warehouseId));

		if (!warehouse) {
			throw error(400, 'Warehouse not found');
		}
		nextWarehouseName = warehouse.name;
	}

	if (updates.name || updates.warehouseId) {
		const [duplicate] = await db
			.select({ id: routes.id })
			.from(routes)
			.where(
				and(eq(routes.name, nextName), eq(routes.warehouseId, nextWarehouseId), ne(routes.id, id))
			);

		if (duplicate) {
			throw error(409, 'Route name must be unique within warehouse');
		}
	}

	const [updated] = await db
		.update(routes)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(eq(routes.id, id))
		.returning();

	await createAuditLog({
		entityType: 'route',
		entityId: id,
		action: 'update',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before: {
				name: existing.name,
				warehouseId: existing.warehouseId,
				managerId: existing.managerId,
				startTime: existing.startTime
			},
			after: {
				name: updated.name,
				warehouseId: updated.warehouseId,
				managerId: updated.managerId,
				startTime: updated.startTime
			}
		}
	});

	const assignment = await getRouteAssignmentDetails(id, date);
	const status = resolveStatus(assignment);
	const shiftProgress = assignment
		? deriveShiftProgress(assignment, status, date, updated.startTime)
		: null;

	return json({
		route: {
			...updated,
			warehouseName: nextWarehouseName,
			status,
			assignmentStatus: assignment?.status ?? null,
			isShiftStarted: isShiftStarted(date, updated.startTime),
			assignmentId: assignment?.assignmentId ?? null,
			driverName: status === 'assigned' ? (assignment?.driverName ?? null) : null,
			bidWindowClosesAt:
				status === 'bidding' ? (assignment?.bidWindowClosesAt?.toISOString() ?? null) : null,
			shiftProgress,
			confirmedAt: assignment?.confirmedAt?.toISOString() ?? null,
			arrivedAt: assignment?.arrivedAt?.toISOString() ?? null,
			startedAt: assignment?.startedAt?.toISOString() ?? null,
			completedAt: assignment?.completedAt?.toISOString() ?? null
		}
	});
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const paramsResult = routeIdParamsSchema.safeParse(params);
	if (!paramsResult.success) {
		throw error(400, 'Invalid route ID');
	}

	const { id } = paramsResult.data;

	const [existing] = await db
		.select({
			id: routes.id,
			name: routes.name,
			warehouseId: routes.warehouseId
		})
		.from(routes)
		.where(eq(routes.id, id));

	if (!existing) {
		throw error(404, 'Route not found');
	}

	// Validate manager has access to this route's warehouse
	const canAccess = await canManagerAccessWarehouse(locals.user.id, existing.warehouseId);
	if (!canAccess) {
		throw error(403, 'No access to this route');
	}

	const today = toLocalYmd();
	const [futureAssignments] = await db
		.select({ count: count(assignments.id) })
		.from(assignments)
		.where(and(eq(assignments.routeId, id), gt(assignments.date, today)));

	if (futureAssignments && futureAssignments.count > 0) {
		throw error(400, 'Cannot delete route with future assignments');
	}

	await db.delete(routes).where(eq(routes.id, id));

	await createAuditLog({
		entityType: 'route',
		entityId: id,
		action: 'delete',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before: { name: existing.name, warehouseId: existing.warehouseId }
		}
	});

	return json({ success: true });
};
