/**
 * Manager Shift Edit API
 *
 * PATCH /api/drivers/[id]/shifts/[assignmentId]/edit - Manager edits parcel counts on any completed shift
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, routes, shifts, user } from '$lib/server/db/schema';
import { driverIdParamsSchema } from '$lib/schemas/driver';
import { shiftAssignmentIdParamsSchema, shiftEditSchema } from '$lib/schemas/shift';
import { updateDriverMetrics } from '$lib/server/services/metrics';
import { and, eq, isNotNull } from 'drizzle-orm';
import { createAuditLog } from '$lib/server/services/audit';
import logger from '$lib/server/logger';
import { requireManagerWithOrg } from '$lib/server/org-scope';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	const { user: manager, organizationId } = requireManagerWithOrg(locals);

	// Validate path params
	const driverParamsResult = driverIdParamsSchema.safeParse({ id: params.id });
	if (!driverParamsResult.success) {
		throw error(400, 'Invalid driver ID');
	}

	const shiftParamsResult = shiftAssignmentIdParamsSchema.safeParse({
		assignmentId: params.assignmentId
	});
	if (!shiftParamsResult.success) {
		throw error(400, 'Invalid assignment ID');
	}

	const { id: driverId } = driverParamsResult.data;
	const { assignmentId } = shiftParamsResult.data;

	// Verify target driver belongs to manager's org
	const [target] = await db
		.select({ id: user.id, role: user.role })
		.from(user)
		.where(and(eq(user.id, driverId), eq(user.organizationId, organizationId)));

	if (!target) {
		throw error(404, 'Driver not found');
	}

	if (target.role !== 'driver') {
		throw error(400, 'User is not a driver');
	}

	// Parse body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}
	const result = shiftEditSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const {
		parcelsStart: newParcelsStart,
		parcelsReturned: newParcelsReturned,
		exceptedReturns: newExceptedReturns,
		exceptionNotes: newExceptionNotes
	} = result.data;

	if (
		newParcelsStart === undefined &&
		newParcelsReturned === undefined &&
		newExceptedReturns === undefined &&
		newExceptionNotes === undefined
	) {
		throw error(400, 'Provide at least one field to edit');
	}

	// Verify assignment belongs to the target driver
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			routeId: assignments.routeId,
			date: assignments.date,
			routeName: routes.name
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.where(eq(assignments.id, assignmentId));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	if (assignment.userId !== driverId) {
		throw error(404, 'Assignment not found');
	}

	// Get shift record
	const [shift] = await db
		.select({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsReturned: shifts.parcelsReturned,
			parcelsDelivered: shifts.parcelsDelivered,
			exceptedReturns: shifts.exceptedReturns,
			exceptionNotes: shifts.exceptionNotes,
			completedAt: shifts.completedAt
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, assignmentId));

	if (!shift) {
		throw error(404, 'Shift not found');
	}

	if (!shift.completedAt) {
		throw error(400, 'Shift not yet completed');
	}

	// Calculate new values
	const finalParcelsStart = newParcelsStart ?? shift.parcelsStart;
	const finalParcelsReturned = newParcelsReturned ?? shift.parcelsReturned;
	const finalExceptedReturns = newExceptedReturns ?? shift.exceptedReturns ?? 0;
	const finalExceptionNotes = newExceptionNotes ?? shift.exceptionNotes;

	if (finalParcelsStart === null || finalParcelsReturned === null) {
		throw error(400, 'Cannot edit — missing parcel data');
	}

	if (finalParcelsReturned > finalParcelsStart) {
		throw error(400, 'Returns cannot exceed starting parcels');
	}

	if (finalExceptedReturns > finalParcelsReturned) {
		throw error(400, 'Excepted returns cannot exceed total returns');
	}

	if (
		finalExceptedReturns > 0 &&
		(!finalExceptionNotes || finalExceptionNotes.trim().length === 0)
	) {
		throw error(400, 'Notes are required when filing return exceptions');
	}

	const parcelsDelivered = finalParcelsStart - finalParcelsReturned;

	const before = {
		parcelsStart: shift.parcelsStart,
		parcelsReturned: shift.parcelsReturned,
		parcelsDelivered: shift.parcelsDelivered,
		exceptedReturns: shift.exceptedReturns,
		exceptionNotes: shift.exceptionNotes
	};

	const log = logger.child({
		operation: 'managerShiftEdit',
		assignmentId,
		driverId,
		managerId: manager.id
	});
	log.info('Starting manager shift edit');

	await db.transaction(async (tx) => {
		// Update shift — WHERE guards re-verify completedAt (TOCTOU fix)
		const [updated] = await tx
			.update(shifts)
			.set({
				parcelsStart: finalParcelsStart,
				parcelsReturned: finalParcelsReturned,
				parcelsDelivered,
				exceptedReturns: finalExceptedReturns,
				exceptionNotes: finalExceptionNotes ?? null
			})
			.where(and(eq(shifts.id, shift.id), isNotNull(shifts.completedAt)))
			.returning({ id: shifts.id });

		if (!updated) {
			throw error(400, 'Shift is no longer in a completed state');
		}

		await createAuditLog(
			{
				entityType: 'shift',
				entityId: shift.id,
				action: 'manager_edit',
				actorType: 'user',
				actorId: manager.id,
				changes: {
					before,
					after: {
						parcelsStart: finalParcelsStart,
						parcelsReturned: finalParcelsReturned,
						parcelsDelivered,
						exceptedReturns: finalExceptedReturns,
						exceptionNotes: finalExceptionNotes
					}
				}
			},
			tx
		);
	});

	log.info({ shiftId: shift.id }, 'Manager shift edit recorded');

	// Recalculate driver metrics
	await updateDriverMetrics(driverId, organizationId);

	return json({ success: true });
};
