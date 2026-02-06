/**
 * Shift Edit API
 *
 * PATCH /api/shifts/[assignmentId]/edit - Edit parcel counts within 1-hour window
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, shifts } from '$lib/server/db/schema';
import { shiftEditSchema } from '$lib/schemas/shift';
import { updateDriverMetrics } from '$lib/server/services/metrics';
import { eq } from 'drizzle-orm';
import { createAuditLog } from '$lib/server/services/audit';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'driver') {
		throw error(403, 'Only drivers can edit shifts');
	}

	const body = await request.json();
	const result = shiftEditSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { parcelsStart: newParcelsStart, parcelsReturned: newParcelsReturned } = result.data;

	if (newParcelsStart === undefined && newParcelsReturned === undefined) {
		throw error(400, 'Provide at least one field to edit');
	}

	// Verify assignment ownership
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId
		})
		.from(assignments)
		.where(eq(assignments.id, params.assignmentId));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	if (assignment.userId !== locals.user.id) {
		throw error(403, 'Forbidden');
	}

	// Get shift record
	const [shift] = await db
		.select({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsReturned: shifts.parcelsReturned,
			parcelsDelivered: shifts.parcelsDelivered,
			completedAt: shifts.completedAt,
			editableUntil: shifts.editableUntil
		})
		.from(shifts)
		.where(eq(shifts.assignmentId, params.assignmentId));

	if (!shift) {
		throw error(404, 'Shift not found');
	}

	if (!shift.completedAt) {
		throw error(400, 'Shift not yet completed');
	}

	if (!shift.editableUntil || new Date() > shift.editableUntil) {
		throw error(400, 'Edit window has expired');
	}

	// Calculate new values
	const finalParcelsStart = newParcelsStart ?? shift.parcelsStart;
	const finalParcelsReturned = newParcelsReturned ?? shift.parcelsReturned;

	if (finalParcelsStart === null || finalParcelsReturned === null) {
		throw error(400, 'Cannot edit — missing parcel data');
	}

	if (finalParcelsReturned > finalParcelsStart) {
		throw error(400, 'Returns cannot exceed starting parcels');
	}

	const parcelsDelivered = finalParcelsStart - finalParcelsReturned;

	const before = {
		parcelsStart: shift.parcelsStart,
		parcelsReturned: shift.parcelsReturned,
		parcelsDelivered: shift.parcelsDelivered
	};

	// Update shift
	const [updatedShift] = await db
		.update(shifts)
		.set({
			parcelsStart: finalParcelsStart,
			parcelsReturned: finalParcelsReturned,
			parcelsDelivered
		})
		.where(eq(shifts.id, shift.id))
		.returning({
			id: shifts.id,
			parcelsStart: shifts.parcelsStart,
			parcelsDelivered: shifts.parcelsDelivered,
			parcelsReturned: shifts.parcelsReturned,
			startedAt: shifts.startedAt,
			completedAt: shifts.completedAt,
			editableUntil: shifts.editableUntil
		});

	await createAuditLog({
		entityType: 'shift',
		entityId: shift.id,
		action: 'edit',
		actorType: 'user',
		actorId: locals.user.id,
		changes: {
			before,
			after: {
				parcelsStart: finalParcelsStart,
				parcelsReturned: finalParcelsReturned,
				parcelsDelivered
			}
		}
	});

	// Recalculate driver metrics
	await updateDriverMetrics(locals.user.id);

	return json({
		success: true,
		shift: updatedShift
	});
};
