/**
 * Shift Edit API
 *
 * PATCH /api/shifts/[assignmentId]/edit - Edit parcel counts within 1-hour window
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { assignments, routes, shifts } from '$lib/server/db/schema';
import { shiftEditSchema } from '$lib/schemas/shift';
import { updateDriverMetrics } from '$lib/server/services/metrics';
import { sendManagerAlert } from '$lib/server/services/notifications';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { createAuditLog } from '$lib/server/services/audit';
import logger from '$lib/server/logger';
import { requireDriverWithOrg } from '$lib/server/org-scope';

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	const { user, organizationId } = requireDriverWithOrg(locals);

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

	// Verify assignment ownership
	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			routeId: assignments.routeId,
			date: assignments.date,
			routeName: routes.name,
			routeStartTime: routes.startTime
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.where(eq(assignments.id, params.assignmentId));

	if (!assignment) {
		throw error(404, 'Assignment not found');
	}

	if (assignment.userId !== user.id) {
		throw error(403, 'Forbidden');
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
	const previousExceptedReturns = shift.exceptedReturns ?? 0;

	const before = {
		parcelsStart: shift.parcelsStart,
		parcelsReturned: shift.parcelsReturned,
		parcelsDelivered: shift.parcelsDelivered,
		exceptedReturns: shift.exceptedReturns,
		exceptionNotes: shift.exceptionNotes
	};

	const userId = user.id;
	const log = logger.child({
		operation: 'shiftEdit',
		assignmentId: params.assignmentId,
		userId
	});
	log.info('Starting shift edit');

	const updatedShift = await db.transaction(async (tx) => {
		// Update shift — WHERE guards re-verify edit window (TOCTOU fix)
		const [updated] = await tx
			.update(shifts)
			.set({
				parcelsStart: finalParcelsStart,
				parcelsReturned: finalParcelsReturned,
				parcelsDelivered,
				exceptedReturns: finalExceptedReturns,
				exceptionNotes: finalExceptionNotes ?? null
			})
			.where(
				and(
					eq(shifts.id, shift.id),
					gt(shifts.editableUntil, new Date()),
					isNotNull(shifts.completedAt)
				)
			)
			.returning({
				id: shifts.id,
				parcelsStart: shifts.parcelsStart,
				parcelsDelivered: shifts.parcelsDelivered,
				parcelsReturned: shifts.parcelsReturned,
				exceptedReturns: shifts.exceptedReturns,
				exceptionNotes: shifts.exceptionNotes,
				startedAt: shifts.startedAt,
				completedAt: shifts.completedAt,
				editableUntil: shifts.editableUntil
			});

		if (!updated) {
			throw error(400, 'Edit window has expired');
		}

		await createAuditLog(
			{
				entityType: 'shift',
				entityId: shift.id,
				action: 'edit',
				actorType: 'user',
				actorId: userId,
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

		return updated;
	});

	log.info({ shiftId: updatedShift.id }, 'Shift edit recorded');

	// Best-effort: notify manager on 0→>0 exception transition
	if (previousExceptedReturns === 0 && finalExceptedReturns > 0) {
		await sendManagerAlert(
			assignment.routeId,
			'return_exception',
			{
				routeName: assignment.routeName ?? 'Unknown Route',
				driverName: user.name ?? 'A driver',
				date: assignment.date,
				routeStartTime: assignment.routeStartTime ?? undefined
			},
			organizationId
		);
	}

	// Recalculate driver metrics
	await updateDriverMetrics(user.id, organizationId);

	return json({
		success: true,
		shift: updatedShift
	});
};
