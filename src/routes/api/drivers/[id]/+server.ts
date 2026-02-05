/**
 * Driver API - Update
 *
 * PATCH /api/drivers/[id] - Update driver settings
 *
 * Supports:
 * - weeklyCap: Adjust weekly cap (1-6)
 * - unflag: Remove flag status (sets isFlagged=false, clears flagWarningDate)
 *
 * All changes are audit logged.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { driverMetrics, user } from '$lib/server/db/schema';
import { driverUpdateSchema } from '$lib/schemas/driver';
import { eq } from 'drizzle-orm';
import { createAuditLog } from '$lib/server/services/audit';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const { id } = params;
	const body = await request.json();
	const result = driverUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	// Verify the target user exists and is a driver
	const [existing] = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			phone: user.phone,
			role: user.role,
			weeklyCap: user.weeklyCap,
			isFlagged: user.isFlagged,
			flagWarningDate: user.flagWarningDate,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, id));

	if (!existing) {
		throw error(404, 'Driver not found');
	}

	if (existing.role !== 'driver') {
		throw error(400, 'User is not a driver');
	}

	const updates = result.data;
	const changes: Record<string, unknown> = {};
	const dbUpdates: { weeklyCap?: number; isFlagged?: boolean; flagWarningDate?: null } = {};

	// Handle weeklyCap update
	if (updates.weeklyCap !== undefined) {
		changes.weeklyCap = { from: existing.weeklyCap, to: updates.weeklyCap };
		dbUpdates.weeklyCap = updates.weeklyCap;
	}

	// Handle unflag action
	if (updates.unflag === true && existing.isFlagged) {
		changes.isFlagged = { from: true, to: false };
		changes.flagWarningDate = { from: existing.flagWarningDate, to: null };
		dbUpdates.isFlagged = false;
		dbUpdates.flagWarningDate = null;
	}

	// If no actual changes, return current state
	if (Object.keys(dbUpdates).length === 0) {
		const [metrics] = await db.select().from(driverMetrics).where(eq(driverMetrics.userId, id));

		return json({
			driver: {
				...existing,
				totalShifts: metrics?.totalShifts ?? 0,
				completedShifts: metrics?.completedShifts ?? 0,
				attendanceRate: metrics?.attendanceRate ?? 0,
				completionRate: metrics?.completionRate ?? 0,
				avgParcelsDelivered: metrics?.avgParcelsDelivered ?? 0
			}
		});
	}

	// Apply updates
	const [updated] = await db
		.update(user)
		.set({
			...dbUpdates,
			updatedAt: new Date()
		})
		.where(eq(user.id, id))
		.returning({
			id: user.id,
			name: user.name,
			email: user.email,
			phone: user.phone,
			weeklyCap: user.weeklyCap,
			isFlagged: user.isFlagged,
			flagWarningDate: user.flagWarningDate,
			createdAt: user.createdAt
		});

	await createAuditLog({
		entityType: 'user',
		entityId: id,
		action: updates.unflag ? 'unflag' : 'update',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before: {
				weeklyCap: existing.weeklyCap,
				isFlagged: existing.isFlagged,
				flagWarningDate: existing.flagWarningDate
			},
			after: {
				weeklyCap: updated.weeklyCap,
				isFlagged: updated.isFlagged,
				flagWarningDate: updated.flagWarningDate
			},
			fields: changes
		}
	});

	// Get metrics for response
	const [metrics] = await db.select().from(driverMetrics).where(eq(driverMetrics.userId, id));

	return json({
		driver: {
			...updated,
			totalShifts: metrics?.totalShifts ?? 0,
			completedShifts: metrics?.completedShifts ?? 0,
			attendanceRate: metrics?.attendanceRate ?? 0,
			completionRate: metrics?.completionRate ?? 0,
			avgParcelsDelivered: metrics?.avgParcelsDelivered ?? 0
		}
	});
};
