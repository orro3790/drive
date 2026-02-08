/**
 * Confirmation Service
 *
 * Manages mandatory shift confirmations. Drivers must confirm shifts
 * 48h before start (confirmable up to 7 days out). Unconfirmed shifts
 * are auto-dropped by the auto-drop cron.
 */

import { db } from '$lib/server/db';
import { assignments, driverMetrics, routes, warehouses } from '$lib/server/db/schema';
import { createAuditLog } from '$lib/server/services/audit';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { toZonedTime, format } from 'date-fns-tz';
import { addDays, addHours, parseISO, set } from 'date-fns';
import logger from '$lib/server/logger';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';

/** Set to the date confirmations go live. Pre-existing assignments are skipped. */
export const CONFIRMATION_DEPLOYMENT_DATE = dispatchPolicy.confirmation.deploymentDate;

function getNowToronto(): Date {
	return toZonedTime(new Date(), dispatchPolicy.timezone.toronto);
}

function getShiftStart(dateString: string): Date {
	const parsed = parseISO(dateString);
	const toronto = toZonedTime(parsed, dispatchPolicy.timezone.toronto);
	return set(toronto, {
		hours: dispatchPolicy.shifts.startHourLocal,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});
}

export interface ConfirmationWindow {
	opensAt: Date;
	deadline: Date;
}

/**
 * Calculate the confirmation window for an assignment date.
 *
 * - Opens: 7 days before shift start (07:00 Toronto)
 * - Deadline: 48 hours before shift start
 */
export function calculateConfirmationDeadline(assignmentDate: string): ConfirmationWindow {
	const shiftStart = getShiftStart(assignmentDate);
	const opensAt = addDays(shiftStart, -dispatchPolicy.confirmation.windowDaysBeforeShift);
	const deadline = addHours(shiftStart, -dispatchPolicy.confirmation.deadlineHoursBeforeShift);
	return { opensAt, deadline };
}

export interface ConfirmShiftResult {
	success: boolean;
	confirmedAt?: Date;
	error?: string;
}

/**
 * Confirm a shift assignment for a driver.
 *
 * Validates:
 * - Assignment exists and belongs to the user
 * - Status is 'scheduled'
 * - Not already confirmed
 * - Within confirmation window (7 days to 48h before shift)
 */
export async function confirmShift(
	assignmentId: string,
	userId: string
): Promise<ConfirmShiftResult> {
	const log = logger.child({ operation: 'confirmShift', assignmentId, userId });

	const [assignment] = await db
		.select({
			id: assignments.id,
			userId: assignments.userId,
			date: assignments.date,
			status: assignments.status,
			confirmedAt: assignments.confirmedAt
		})
		.from(assignments)
		.where(eq(assignments.id, assignmentId));

	if (!assignment) {
		return { success: false, error: 'Assignment not found' };
	}

	if (assignment.userId !== userId) {
		return { success: false, error: 'Forbidden' };
	}

	if (assignment.status !== 'scheduled') {
		return { success: false, error: 'Only scheduled assignments can be confirmed' };
	}

	if (assignment.confirmedAt) {
		return { success: false, error: 'Assignment already confirmed' };
	}

	const now = getNowToronto();
	const { opensAt, deadline } = calculateConfirmationDeadline(assignment.date);

	if (now < opensAt) {
		return { success: false, error: 'Confirmation window not yet open' };
	}

	if (now > deadline) {
		return { success: false, error: 'Confirmation deadline has passed' };
	}

	const confirmedAt = new Date();

	await db
		.update(assignments)
		.set({ confirmedAt, updatedAt: confirmedAt })
		.where(eq(assignments.id, assignmentId));

	await db
		.update(driverMetrics)
		.set({
			confirmedShifts: sql`${driverMetrics.confirmedShifts} + 1`,
			updatedAt: confirmedAt
		})
		.where(eq(driverMetrics.userId, userId));

	await createAuditLog({
		entityType: 'assignment',
		entityId: assignmentId,
		action: 'confirm',
		actorType: 'user',
		actorId: userId,
		changes: {
			before: { confirmedAt: null },
			after: { confirmedAt: confirmedAt.toISOString() }
		}
	});

	log.info({ confirmedAt }, 'Shift confirmed');

	return { success: true, confirmedAt };
}

export interface UnconfirmedAssignment {
	id: string;
	date: string;
	routeName: string;
	warehouseName: string;
	confirmationOpensAt: string;
	confirmationDeadline: string;
	isConfirmable: boolean;
}

/**
 * Get unconfirmed assignments for a driver that are within
 * the confirmation window (7 days to 48h before shift).
 */
export async function getUnconfirmedAssignments(userId: string): Promise<UnconfirmedAssignment[]> {
	const now = getNowToronto();
	const todayString = format(now, 'yyyy-MM-dd', { timeZone: dispatchPolicy.timezone.toronto });

	const rows = await db
		.select({
			id: assignments.id,
			date: assignments.date,
			routeName: routes.name,
			warehouseName: warehouses.name,
			confirmedAt: assignments.confirmedAt
		})
		.from(assignments)
		.innerJoin(routes, eq(assignments.routeId, routes.id))
		.innerJoin(warehouses, eq(routes.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.userId, userId),
				eq(assignments.status, 'scheduled'),
				isNull(assignments.confirmedAt),
				gte(assignments.date, todayString)
			)
		);

	const result: UnconfirmedAssignment[] = [];

	for (const row of rows) {
		const { opensAt, deadline } = calculateConfirmationDeadline(row.date);
		const isConfirmable = now >= opensAt && now <= deadline;

		// Only include assignments within or approaching the confirmation window
		if (now <= deadline) {
			result.push({
				id: row.id,
				date: row.date,
				routeName: row.routeName,
				warehouseName: row.warehouseName,
				confirmationOpensAt: opensAt.toISOString(),
				confirmationDeadline: deadline.toISOString(),
				isConfirmable
			});
		}
	}

	return result;
}
