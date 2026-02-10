/**
 * Route API - List & Create
 *
 * GET  /api/routes - List all routes (with warehouse + status + driver info)
 * POST /api/routes - Create a new route
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, bidWindows, routes, user, warehouses } from '$lib/server/db/schema';
import { routeCreateSchema, type RouteStatus } from '$lib/schemas/route';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getManagerWarehouseIds, canManagerAccessWarehouse } from '$lib/server/services/managers';
import { createAuditLog } from '$lib/server/services/audit';
import { z } from 'zod';

const VALID_STATUSES: RouteStatus[] = ['assigned', 'unfilled', 'bidding'];
const warehouseIdQuerySchema = z.string().uuid();

function toLocalYmd(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function isValidDate(value: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type AssignmentInfo = {
	assignmentId: string;
	status: string;
	userId: string | null;
	driverName: string | null;
	bidWindowClosesAt: Date | null;
};

function resolveStatus(assignment?: AssignmentInfo): RouteStatus {
	if (!assignment) return 'unfilled';
	if (assignment.status === 'unfilled') {
		return assignment.bidWindowClosesAt ? 'bidding' : 'unfilled';
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

	const currentUserId = locals.user.id;
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

	if (warehouseId && !warehouseIdQuerySchema.safeParse(warehouseId).success) {
		throw error(400, 'Invalid warehouse ID');
	}

	// Get warehouses this manager can access
	const accessibleWarehouses = await getManagerWarehouseIds(currentUserId);
	if (accessibleWarehouses.length === 0) {
		return json({ routes: [], date });
	}

	// Build base query with warehouse access filter
	const whereConditions = warehouseId
		? and(eq(routes.warehouseId, warehouseId), inArray(routes.warehouseId, accessibleWarehouses))
		: inArray(routes.warehouseId, accessibleWarehouses);

	const routeRows = await db
		.select({
			id: routes.id,
			name: routes.name,
			startTime: routes.startTime,
			warehouseId: warehouses.id,
			warehouseName: warehouses.name,
			managerId: routes.managerId,
			createdAt: routes.createdAt,
			updatedAt: routes.updatedAt
		})
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(whereConditions)
		.orderBy(routes.name);
	const routeIds = routeRows.map((route) => route.id);

	// Fetch assignments with driver info
	const assignmentRows = routeIds.length
		? await db
				.select({
					routeId: assignments.routeId,
					assignmentId: assignments.id,
					status: assignments.status,
					userId: assignments.userId,
					driverName: user.name
				})
				.from(assignments)
				.leftJoin(user, eq(user.id, assignments.userId))
				.where(and(eq(assignments.date, date), inArray(assignments.routeId, routeIds)))
		: [];

	const assignmentIds = assignmentRows.map((row) => row.assignmentId);
	const openBidWindowRows = assignmentIds.length
		? await db
				.select({
					assignmentId: bidWindows.assignmentId,
					closesAt: bidWindows.closesAt
				})
				.from(bidWindows)
				.where(and(eq(bidWindows.status, 'open'), inArray(bidWindows.assignmentId, assignmentIds)))
				.orderBy(desc(bidWindows.opensAt), desc(bidWindows.id))
		: [];

	const openBidWindowMap = new Map<string, Date>();
	for (const row of openBidWindowRows) {
		if (!openBidWindowMap.has(row.assignmentId)) {
			openBidWindowMap.set(row.assignmentId, row.closesAt);
		}
	}

	const assignmentMap = new Map(
		assignmentRows.map((row) => [
			row.routeId,
			{
				assignmentId: row.assignmentId,
				status: row.status,
				userId: row.userId,
				driverName: row.driverName,
				bidWindowClosesAt: openBidWindowMap.get(row.assignmentId) ?? null
			}
		])
	);

	const routesWithStatus = routeRows
		.map((route) => {
			const assignment = assignmentMap.get(route.id);
			const status = resolveStatus(assignment);
			return {
				...route,
				status,
				isMyRoute: route.managerId === currentUserId,
				assignmentId: assignment?.assignmentId ?? null,
				driverName: status === 'assigned' ? (assignment?.driverName ?? null) : null,
				bidWindowClosesAt:
					status === 'bidding' ? (assignment?.bidWindowClosesAt?.toISOString() ?? null) : null
			};
		})
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

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const result = routeCreateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { name, warehouseId, managerId, startTime } = result.data;

	// Validate manager has access to this warehouse
	const canAccess = await canManagerAccessWarehouse(locals.user.id, warehouseId);
	if (!canAccess) {
		throw error(403, 'No access to this warehouse');
	}

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
			warehouseId,
			managerId: managerId ?? locals.user.id,
			startTime
		})
		.returning();

	await createAuditLog({
		entityType: 'route',
		entityId: created.id,
		action: 'create',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			after: { name, warehouseId, managerId: created.managerId, startTime }
		}
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
