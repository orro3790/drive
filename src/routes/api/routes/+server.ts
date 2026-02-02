/**
 * Route API - List & Create
 *
 * GET  /api/routes - List all routes (with warehouse + status)
 * POST /api/routes - Create a new route
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, auditLogs, bidWindows, routes, warehouses } from '$lib/server/db/schema';
import { routeCreateSchema, type RouteStatus } from '$lib/schemas/route';
import { and, eq, inArray } from 'drizzle-orm';

const VALID_STATUSES: RouteStatus[] = ['assigned', 'unfilled', 'bidding'];

function toLocalYmd(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function isValidDate(value: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveStatus(assignment?: {
	status: string;
	bidWindowStatus: string | null;
}): RouteStatus {
	if (!assignment) return 'unfilled';
	if (assignment.status === 'unfilled') {
		return assignment.bidWindowStatus === 'open' ? 'bidding' : 'unfilled';
	}
	return 'assigned';
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const warehouseId = url.searchParams.get('warehouseId');
	const statusFilter = url.searchParams.get('status');
	const dateParam = url.searchParams.get('date');
	const date = dateParam || toLocalYmd();

	if (dateParam && !isValidDate(dateParam)) {
		throw error(400, 'Invalid date');
	}

	if (statusFilter && !VALID_STATUSES.includes(statusFilter as RouteStatus)) {
		throw error(400, 'Invalid status');
	}

	const baseQuery = db
		.select({
			id: routes.id,
			name: routes.name,
			warehouseId: warehouses.id,
			warehouseName: warehouses.name,
			createdAt: routes.createdAt,
			updatedAt: routes.updatedAt
		})
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.orderBy(routes.name);

	const routeRows = warehouseId
		? await baseQuery.where(eq(routes.warehouseId, warehouseId))
		: await baseQuery;
	const routeIds = routeRows.map((route) => route.id);

	const assignmentRows = routeIds.length
		? await db
				.select({
					routeId: assignments.routeId,
					status: assignments.status,
					bidWindowStatus: bidWindows.status
				})
				.from(assignments)
				.leftJoin(bidWindows, eq(bidWindows.assignmentId, assignments.id))
				.where(and(eq(assignments.date, date), inArray(assignments.routeId, routeIds)))
		: [];

	const assignmentMap = new Map(assignmentRows.map((row) => [row.routeId, row]));

	const routesWithStatus = routeRows
		.map((route) => ({
			...route,
			status: resolveStatus(assignmentMap.get(route.id))
		}))
		.filter((route) => (statusFilter ? route.status === statusFilter : true));

	return json({ routes: routesWithStatus, date });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const body = await request.json();
	const result = routeCreateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { name, warehouseId } = result.data;

	const [warehouse] = await db
		.select({ id: warehouses.id, name: warehouses.name })
		.from(warehouses)
		.where(eq(warehouses.id, warehouseId));

	if (!warehouse) {
		throw error(400, 'Warehouse not found');
	}

	const [existing] = await db
		.select({ id: routes.id })
		.from(routes)
		.where(and(eq(routes.name, name), eq(routes.warehouseId, warehouseId)));

	if (existing) {
		throw error(409, 'Route name must be unique within warehouse');
	}

	const [created] = await db
		.insert(routes)
		.values({
			name,
			warehouseId
		})
		.returning();

	// Audit log - skip actorId since Better Auth IDs don't match domain users table
	await db.insert(auditLogs).values({
		entityType: 'route',
		entityId: created.id,
		action: 'create',
		actorType: 'user',
		changes: { name, warehouseId }
	});

	return json(
		{
			route: {
				...created,
				warehouseName: warehouse.name,
				status: 'unfilled'
			}
		},
		{ status: 201 }
	);
};
