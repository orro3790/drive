/**
 * Route List API for Preferences
 *
 * GET /api/preferences/routes - List all routes for driver preference selection
 * Drivers need access to route list for preference selection.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { routes, warehouses } from '$lib/server/db/schema';
import { and, eq, ilike, or } from 'drizzle-orm';
import { requireDriverWithOrg } from '$lib/server/org-scope';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { organizationId } = requireDriverWithOrg(locals);

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
				and(
					eq(warehouses.organizationId, organizationId),
					or(ilike(routes.name, `%${query}%`), ilike(warehouses.name, `%${query}%`))
				)
			)
		: await baseQuery.where(eq(warehouses.organizationId, organizationId));

	return json({ routes: routeRows });
};
