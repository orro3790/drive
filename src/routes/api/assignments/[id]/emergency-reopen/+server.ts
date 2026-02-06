/**
 * Emergency Reopen API
 *
 * POST /api/assignments/[id]/emergency-reopen - Manager manually creates emergency bid window
 *
 * Creates an emergency bid window with 20% bonus for today's assignments.
 * Notifies all available drivers. Increments original driver's noShows metric.
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, driverMetrics, routes, warehouses } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import { format, toZonedTime } from 'date-fns-tz';
import { canManagerAccessWarehouse } from '$lib/server/services/managers';
import { createBidWindow } from '$lib/server/services/bidding';
import {
	notifyAvailableDriversForEmergency,
	sendManagerAlert
} from '$lib/server/services/notifications';
import { createAuditLog } from '$lib/server/services/audit';
import logger from '$lib/server/logger';

const TORONTO_TZ = 'America/Toronto';

export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role === 'driver') {
		throw error(403, 'Only managers can reopen routes');
	}

	const { id } = params;
	const log = logger.child({ operation: 'emergencyReopen', assignmentId: id });

	// Get assignment with route + warehouse details
	const [assignment] = await db
		.select({
			id: assignments.id,
			routeId: assignments.routeId,
			warehouseId: assignments.warehouseId,
			userId: assignments.userId,
			date: assignments.date,
			status: assignments.status,
			routeName: routes.name,
			warehouseName: warehouses.name
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(eq(assignments.id, id));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	// Verify manager has warehouse access
	const hasAccess = await canManagerAccessWarehouse(locals.user.id, assignment.warehouseId);
	if (!hasAccess) {
		throw error(403, 'No access to this warehouse');
	}

	// Verify assignment is for today
	const today = format(toZonedTime(new Date(), TORONTO_TZ), 'yyyy-MM-dd');
	if (assignment.date !== today) {
		throw error(400, 'Emergency reopen is only available for today\'s assignments');
	}

	// Create emergency bid window
	const result = await createBidWindow(id, {
		mode: 'emergency',
		trigger: 'manager',
		payBonusPercent: 20
	});

	if (!result.success) {
		throw error(409, result.reason ?? 'Failed to create emergency bid window');
	}

	// Increment original driver's noShows metric (if there was an assigned driver)
	if (assignment.userId) {
		try {
			await db
				.update(driverMetrics)
				.set({
					noShows: sql`${driverMetrics.noShows} + 1`,
					updatedAt: new Date()
				})
				.where(eq(driverMetrics.userId, assignment.userId));
		} catch (err) {
			log.warn({ driverId: assignment.userId, error: err }, 'Failed to increment noShows');
		}
	}

	// Mark assignment as unfilled if not already
	if (assignment.status !== 'unfilled') {
		await db
			.update(assignments)
			.set({ status: 'unfilled', userId: null, updatedAt: new Date() })
			.where(eq(assignments.id, id));
	}

	// Notify available drivers
	let notifiedCount = 0;
	try {
		notifiedCount = await notifyAvailableDriversForEmergency({
			assignmentId: id,
			routeName: assignment.routeName,
			warehouseName: assignment.warehouseName,
			date: assignment.date,
			payBonusPercent: 20
		});
	} catch (err) {
		log.warn({ error: err }, 'Emergency notification dispatch failed');
	}

	// Create audit log
	await createAuditLog({
		entityType: 'assignment',
		entityId: id,
		action: 'emergency_reopen',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before: { status: assignment.status, userId: assignment.userId },
			after: { status: 'unfilled', userId: null },
			trigger: 'manager',
			bidWindowId: result.bidWindowId,
			notifiedCount
		}
	});

	log.info(
		{ bidWindowId: result.bidWindowId, notifiedCount },
		'Emergency route reopened by manager'
	);

	return json({
		success: true,
		bidWindowId: result.bidWindowId,
		notifiedCount
	});
};
