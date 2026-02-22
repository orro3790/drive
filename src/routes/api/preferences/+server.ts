/**
 * Driver Preferences API
 *
 * GET  /api/preferences - Get current user's preferences
 * PUT  /api/preferences - Update preferences
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverPreferences, routes, warehouses } from '$lib/server/db/schema';
import { preferencesUpdateSchema } from '$lib/schemas/preferences';
import type { DayCounts } from '$lib/schemas/preferences';
import { eq, inArray, sql } from 'drizzle-orm';
import { requireDriverWithOrg } from '$lib/server/org-scope';

export const GET: RequestHandler = async ({ locals }) => {
	const { user, organizationId } = requireDriverWithOrg(locals);

	const userId = user.id;

	// Get existing preferences and day demand counts in parallel
	const [preferencesResult, demandResult] = await Promise.all([
		db.select().from(driverPreferences).where(eq(driverPreferences.userId, userId)),
		db.execute<{ day_value: string; driver_count: number }>(sql`
			SELECT day_value::text, COUNT(DISTINCT dp.user_id)::int AS driver_count
			FROM driver_preferences dp
			JOIN "user" u ON dp.user_id = u.id
			CROSS JOIN LATERAL unnest(dp.preferred_days) AS day_value
			WHERE u.organization_id = ${organizationId}
			  AND u.role = 'driver'
			GROUP BY day_value
			ORDER BY day_value
		`)
	]);

	const [preferences] = preferencesResult;

	// Build dayCounts record from raw rows
	// db.execute() returns QueryResult with .rows for neon-serverless/node-postgres
	const dayCounts: DayCounts = {};
	const rows = Array.isArray(demandResult)
		? demandResult
		: (demandResult as { rows: { day_value: string; driver_count: number }[] }).rows;
	if (rows) {
		for (const row of rows) {
			dayCounts[row.day_value] = row.driver_count;
		}
	}

	// Get route details for preferred routes
	let preferredRoutesWithDetails: Array<{
		id: string;
		name: string;
		warehouseName: string;
	}> = [];

	if (preferences?.preferredRoutes?.length) {
		const routeRows = await db
			.select({
				id: routes.id,
				name: routes.name,
				warehouseName: warehouses.name
			})
			.from(routes)
			.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
			.where(inArray(routes.id, preferences.preferredRoutes));

		preferredRoutesWithDetails = routeRows;
	}

	return json({
		preferences: preferences
			? {
					...preferences,
					preferredRoutesDetails: preferredRoutesWithDetails
				}
			: null,
		isLocked: false,
		lockDeadline: null,
		lockedUntil: null,
		dayCounts,
		weeklyCap: user.weeklyCap ?? 4
	});
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const { user } = requireDriverWithOrg(locals);

	const userId = user.id;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	const result = preferencesUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { preferredDays, preferredRoutes } = result.data;
	const now = new Date();

	// Validate that all route IDs exist
	if (preferredRoutes.length > 0) {
		const validRoutes = await db
			.select({ id: routes.id })
			.from(routes)
			.where(inArray(routes.id, preferredRoutes));

		if (validRoutes.length !== preferredRoutes.length) {
			throw error(400, 'One or more route IDs are invalid');
		}
	}

	const [updated] = await db
		.insert(driverPreferences)
		.values({
			userId,
			preferredDays,
			preferredRoutes,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: driverPreferences.userId,
			set: {
				preferredDays,
				preferredRoutes,
				updatedAt: now
			}
		})
		.returning();

	if (!updated) {
		throw error(500, 'Failed to save preferences');
	}

	let preferredRoutesWithDetails: Array<{
		id: string;
		name: string;
		warehouseName: string;
	}> = [];

	if (updated?.preferredRoutes?.length) {
		const routeRows = await db
			.select({
				id: routes.id,
				name: routes.name,
				warehouseName: warehouses.name
			})
			.from(routes)
			.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
			.where(inArray(routes.id, updated.preferredRoutes));

		preferredRoutesWithDetails = routeRows;
	}

	return json({
		preferences: {
			...updated,
			preferredRoutesDetails: preferredRoutesWithDetails
		},
		isLocked: false,
		lockDeadline: null,
		lockedUntil: null
	});
};
