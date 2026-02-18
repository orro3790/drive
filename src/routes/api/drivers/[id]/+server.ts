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
import { driverHealthState, driverMetrics, user } from '$lib/server/db/schema';
import { driverIdParamsSchema, driverUpdateSchema } from '$lib/schemas/driver';
import { and, eq } from 'drizzle-orm';
import { createAuditLog } from '$lib/server/services/audit';
import { requireManagerWithOrg } from '$lib/server/org-scope';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);
	const paramsResult = driverIdParamsSchema.safeParse(params);

	if (!paramsResult.success) {
		throw error(400, 'Invalid driver ID');
	}

	const { id } = paramsResult.data;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}
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
		.where(and(eq(user.id, id), eq(user.organizationId, organizationId)));

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

	// Handle reinstate action (restore assignment pool eligibility)
	if (updates.reinstate === true) {
		const [healthState] = await db
			.select({
				assignmentPoolEligible: driverHealthState.assignmentPoolEligible,
				requiresManagerIntervention: driverHealthState.requiresManagerIntervention
			})
			.from(driverHealthState)
			.where(eq(driverHealthState.userId, id));

		if (healthState && !healthState.assignmentPoolEligible) {
			const now = new Date();
			await db
				.update(driverHealthState)
				.set({
					assignmentPoolEligible: true,
					requiresManagerIntervention: false,
					reinstatedAt: now,
					updatedAt: now
				})
				.where(eq(driverHealthState.userId, id));

			changes.assignmentPoolEligible = { from: false, to: true };
			changes.requiresManagerIntervention = { from: true, to: false };

			await createAuditLog({
				entityType: 'driver_health',
				entityId: id,
				action: 'reinstate',
				actorType: 'user',
				actorId: manager.id,
				changes: {
					assignmentPoolEligible: { from: false, to: true },
					requiresManagerIntervention: { from: true, to: false }
				}
			});
		}
	}

	// If no actual changes, return current state
	if (Object.keys(dbUpdates).length === 0 && Object.keys(changes).length === 0) {
		const [metrics] = await db.select().from(driverMetrics).where(eq(driverMetrics.userId, id));
		const [hs] = await db
			.select({ assignmentPoolEligible: driverHealthState.assignmentPoolEligible })
			.from(driverHealthState)
			.where(eq(driverHealthState.userId, id));

		return json({
			driver: {
				...existing,
				totalShifts: metrics?.totalShifts ?? 0,
				completedShifts: metrics?.completedShifts ?? 0,
				attendanceRate: metrics?.attendanceRate ?? 0,
				completionRate: metrics?.completionRate ?? 0,
				avgParcelsDelivered: metrics?.avgParcelsDelivered ?? 0,
				assignmentPoolEligible: hs?.assignmentPoolEligible ?? true
			}
		});
	}

	// Apply user table updates if any
	let updated = existing;
	if (Object.keys(dbUpdates).length > 0) {
		const [result] = await db
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
				role: user.role,
				weeklyCap: user.weeklyCap,
				isFlagged: user.isFlagged,
				flagWarningDate: user.flagWarningDate,
				createdAt: user.createdAt
			});
		updated = result;

		await createAuditLog({
			entityType: 'user',
			entityId: id,
			action: updates.unflag ? 'unflag' : 'update',
			actorType: 'user',
			actorId: manager.id,
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
	}

	// Get metrics and health state for response
	const [metrics] = await db.select().from(driverMetrics).where(eq(driverMetrics.userId, id));
	const [hs] = await db
		.select({ assignmentPoolEligible: driverHealthState.assignmentPoolEligible })
		.from(driverHealthState)
		.where(eq(driverHealthState.userId, id));

	return json({
		driver: {
			...updated,
			totalShifts: metrics?.totalShifts ?? 0,
			completedShifts: metrics?.completedShifts ?? 0,
			attendanceRate: metrics?.attendanceRate ?? 0,
			completionRate: metrics?.completionRate ?? 0,
			avgParcelsDelivered: metrics?.avgParcelsDelivered ?? 0,
			assignmentPoolEligible: hs?.assignmentPoolEligible ?? true
		}
	});
};
