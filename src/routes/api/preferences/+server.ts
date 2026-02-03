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
import { eq, inArray } from 'drizzle-orm';

/**
 * Get next Sunday 23:59:59 Toronto time as lock deadline
 */
function getNextLockDeadline(): Date {
	const now = new Date();
	// Get current time in Toronto
	const torontoFormatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Toronto',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		weekday: 'short'
	});
	const parts = torontoFormatter.formatToParts(now);
	const weekday = parts.find((p) => p.type === 'weekday')?.value;

	// Calculate days until Sunday (0 = Sunday)
	const dayMap: Record<string, number> = {
		Sun: 0,
		Mon: 1,
		Tue: 2,
		Wed: 3,
		Thu: 4,
		Fri: 5,
		Sat: 6
	};
	const currentDay = dayMap[weekday || 'Mon'] ?? 1;
	const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;

	// Set to next Sunday 23:59:59
	const deadline = new Date(now);
	deadline.setDate(deadline.getDate() + daysUntilSunday);
	deadline.setHours(23, 59, 59, 999);

	return deadline;
}

/**
 * Check if preferences are locked for current cycle (Week N+2)
 * Preferences lock Sunday 23:59 for schedules 2 weeks out
 */
function isPreferencesLocked(lockedAt: Date | null): boolean {
	if (!lockedAt) return false;

	const now = new Date();
	const lockDeadline = getNextLockDeadline();

	// If locked after the last deadline, preferences are still locked
	return lockedAt >= lockDeadline;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Drivers only
	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can access preferences');
	}

	const userId = locals.user.id;

	// Get existing preferences
	const [preferences] = await db
		.select()
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

	const lockDeadline = getNextLockDeadline();
	const isLocked = isPreferencesLocked(preferences?.lockedAt ?? null);

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
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can update preferences');
	}

	const userId = locals.user.id;

	// Check if preferences are locked
	const [existing] = await db
		.select()
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

	if (isPreferencesLocked(existing?.lockedAt ?? null)) {
		throw error(423, 'Preferences are locked for current scheduling cycle');
	}

	const body = await request.json();
	const result = preferencesUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { preferredDays, preferredRoutes } = result.data;

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

	const now = new Date();

	// Upsert preferences
	if (existing) {
		await db
			.update(driverPreferences)
			.set({
				preferredDays,
				preferredRoutes,
				updatedAt: now
			})
			.where(eq(driverPreferences.id, existing.id));
	} else {
		await db.insert(driverPreferences).values({
			userId,
			preferredDays,
			preferredRoutes,
			updatedAt: now
		});
	}

	// Fetch updated preferences with route details
	const [updated] = await db
		.select()
		.from(driverPreferences)
		.where(eq(driverPreferences.userId, userId));

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

	const lockDeadline = getNextLockDeadline();

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
