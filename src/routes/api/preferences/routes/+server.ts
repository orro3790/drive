/**
 * Route List API for Preferences
 *
 * GET /api/preferences/routes - List all routes for driver preference selection
 * Drivers need access to route list for preference selection.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { routes, warehouses } from '$lib/server/db/schema';
import { eq, ilike, or } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Drivers only
	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can access this endpoint');
	}

	const query = url.searchParams.get('q')?.trim() || '';

	const baseQuery = db
		.select({
			id: routes.id,
			name: routes.name,
			warehouseName: warehouses.name
		})
		.from(routes)
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.orderBy(routes.name)
		.limit(50);

	const routeRows = query
		? await baseQuery.where(
				or(ilike(routes.name, `%${query}%`), ilike(warehouses.name, `%${query}%`))
			)
		: await baseQuery;

	return json({ routes: routeRows });
};
