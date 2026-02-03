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
	auditLogs,
	bidWindows,
	routes,
	user,
	warehouses
} from '$lib/server/db/schema';
import { routeUpdateSchema, type RouteStatus } from '$lib/schemas/route';
import { and, eq, ne, gt, count } from 'drizzle-orm';

function toLocalYmd(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function isValidDate(value: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type AssignmentDetails = {
	assignmentId: string;
	status: string;
	driverName: string | null;
	bidWindowStatus: string | null;
	bidWindowClosesAt: Date | null;
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
			bidWindowStatus: bidWindows.status,
			bidWindowClosesAt: bidWindows.closesAt
		})
		.from(assignments)
		.leftJoin(user, eq(user.id, assignments.userId))
		.leftJoin(bidWindows, eq(bidWindows.assignmentId, assignments.id))
		.where(and(eq(assignments.routeId, routeId), eq(assignments.date, date)));

	return assignment ?? null;
}

export const PATCH: RequestHandler = async ({ locals, params, request, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const { id } = params;
	const body = await request.json();
	const result = routeUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const [existing] = await db
		.select({
			id: routes.id,
			name: routes.name,
			warehouseId: routes.warehouseId,
			warehouseName: warehouses.name,
			createdAt: routes.createdAt,
			updatedAt: routes.updatedAt
		})
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(eq(routes.id, id));

	if (!existing) {
		throw error(404, 'Route not found');
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
		return json({
			route: {
				...existing,
				status,
				assignmentId: assignment?.assignmentId ?? null,
				driverName: status === 'assigned' ? (assignment?.driverName ?? null) : null,
				bidWindowClosesAt:
					status === 'bidding' ? (assignment?.bidWindowClosesAt?.toISOString() ?? null) : null
			}
		});
	}

	const nextName = updates.name ?? existing.name;
	const nextWarehouseId = updates.warehouseId ?? existing.warehouseId;

	let nextWarehouseName = existing.warehouseName;
	if (updates.warehouseId && updates.warehouseId !== existing.warehouseId) {
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

	// Audit log - skip actorId since Better Auth IDs don't match domain users table
	await db.insert(auditLogs).values({
		entityType: 'route',
		entityId: id,
		action: 'update',
		actorType: 'user',
		changes: updates
	});

	const assignment = await getRouteAssignmentDetails(id, date);
	const status = resolveStatus(assignment);

	return json({
		route: {
			...updated,
			warehouseName: nextWarehouseName,
			status,
			assignmentId: assignment?.assignmentId ?? null,
			driverName: status === 'assigned' ? (assignment?.driverName ?? null) : null,
			bidWindowClosesAt:
				status === 'bidding' ? (assignment?.bidWindowClosesAt?.toISOString() ?? null) : null
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

	const { id } = params;

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

	const today = toLocalYmd();
	const [futureAssignments] = await db
		.select({ count: count(assignments.id) })
		.from(assignments)
		.where(and(eq(assignments.routeId, id), gt(assignments.date, today)));

	if (futureAssignments && futureAssignments.count > 0) {
		throw error(400, 'Cannot delete route with future assignments');
	}

	await db.delete(routes).where(eq(routes.id, id));

	// Audit log - skip actorId since Better Auth IDs don't match domain users table
	await db.insert(auditLogs).values({
		entityType: 'route',
		entityId: id,
		action: 'delete',
		actorType: 'user',
		changes: { name: existing.name, warehouseId: existing.warehouseId }
	});

	return json({ success: true });
};
