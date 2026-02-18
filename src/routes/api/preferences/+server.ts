/**
 * Driver Preferences API
 *
 * GET  /api/preferences - Get current user's preferences
 * PUT  /api/preferences - Update preferences (if not locked)
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverPreferences, routes, warehouses } from '$lib/server/db/schema';
import { preferencesUpdateSchema } from '$lib/schemas/preferences';
import { eq, inArray, sql } from 'drizzle-orm';
import { requireDriverWithOrg } from '$lib/server/org-scope';
import {
	getCurrentPreferenceLockDeadline,
	getNextPreferenceLockDeadline,
	isCurrentPreferenceCycleLocked
} from '$lib/server/time/preferenceLock';

/**
 * Check if preferences are locked for the active cycle.
 */
function isPreferencesLocked(lockedAt: Date | null, referenceInstant: Date): boolean {
	return isCurrentPreferenceCycleLocked(lockedAt, referenceInstant);
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = requireDriverWithOrg(locals);

	const userId = user.id;

	// Get existing preferences
	const [preferences] = await db
		.select()
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

	const now = new Date();
	const lockDeadline = getNextPreferenceLockDeadline(now);
	const isLocked = isPreferencesLocked(preferences?.lockedAt ?? null, now);

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
		isLocked,
		lockDeadline,
		lockedUntil: isLocked ? preferences?.lockedAt : null
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
	const currentLockDeadline = getCurrentPreferenceLockDeadline(now);

	if (now >= currentLockDeadline) {
		throw error(423, 'Preferences are locked for current scheduling cycle');
	}

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
			},
			where: sql`${driverPreferences.lockedAt} is null or ${driverPreferences.lockedAt} < ${currentLockDeadline}`
		})
		.returning();

	if (!updated) {
		throw error(423, 'Preferences are locked for current scheduling cycle');
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

	const lockDeadline = getNextPreferenceLockDeadline(now);

	return json({
		preferences: {
			...updated,
			preferredRoutesDetails: preferredRoutesWithDetails
		},
		isLocked: false,
		lockDeadline,
		lockedUntil: null
	});
};
