import { fromZonedTime } from 'date-fns-tz';

import { dispatchPolicy, parseRouteStartTime } from '$lib/config/dispatchPolicy';
import type { AssignmentStatus } from '$lib/schemas/assignment';
import { getTorontoDateTimeInstant, toTorontoDateString } from '$lib/server/time/toronto';

const HOUR_IN_MS = 60 * 60 * 1000;

export interface AssignmentLifecycleContext {
	nowToronto: Date;
	torontoToday: string;
	timezone: string;
}

export interface AssignmentLifecycleInput {
	assignmentDate: string;
	assignmentStatus: AssignmentStatus;
	confirmedAt: Date | null;
	shiftArrivedAt: Date | null;
	parcelsStart: number | null;
	shiftCompletedAt: Date | null;
	routeStartTime?: string | null;
}

export interface AssignmentLifecycleOutput {
	confirmationOpensAt: Date;
	confirmationDeadline: Date;
	isCancelable: boolean;
	isLateCancel: boolean;
	isConfirmable: boolean;
	isArrivable: boolean;
	isStartable: boolean;
	isCompletable: boolean;
}

export function createAssignmentLifecycleContext(
	now: Date = new Date()
): AssignmentLifecycleContext {
	const timezone = dispatchPolicy.timezone.toronto;

	return {
		nowToronto: now,
		torontoToday: toTorontoDateString(now),
		timezone
	};
}

function getShiftStart(assignmentDate: string, timezone: string): Date {
	if (timezone === dispatchPolicy.timezone.toronto) {
		return getTorontoDateTimeInstant(assignmentDate, {
			hours: dispatchPolicy.shifts.startHourLocal
		});
	}

	const localDateTime = `${assignmentDate}T${String(dispatchPolicy.shifts.startHourLocal).padStart(2, '0')}:00:00`;
	return fromZonedTime(localDateTime, timezone);
}

export function calculateArrivalDeadline(
	assignmentDate: string,
	timezone: string = dispatchPolicy.timezone.toronto,
	routeStartTime?: string | null
): Date {
	const { hours, minutes } = routeStartTime
		? parseRouteStartTime(routeStartTime)
		: { hours: dispatchPolicy.shifts.arrivalDeadlineHourLocal, minutes: 0 };

	if (timezone === dispatchPolicy.timezone.toronto) {
		return getTorontoDateTimeInstant(assignmentDate, { hours, minutes });
	}

	const localDateTime = `${assignmentDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
	return fromZonedTime(localDateTime, timezone);
}

export function calculateConfirmationWindow(
	assignmentDate: string,
	timezone: string = dispatchPolicy.timezone.toronto
): { opensAt: Date; deadline: Date } {
	const shiftStart = getShiftStart(assignmentDate, timezone);
	const opensAt = new Date(
		shiftStart.getTime() - dispatchPolicy.confirmation.windowDaysBeforeShift * 24 * HOUR_IN_MS
	);
	const deadline = new Date(
		shiftStart.getTime() - dispatchPolicy.confirmation.deadlineHoursBeforeShift * HOUR_IN_MS
	);

	return { opensAt, deadline };
}

export function deriveAssignmentLifecycle(
	input: AssignmentLifecycleInput,
	context: AssignmentLifecycleContext
): AssignmentLifecycleOutput {
	const { opensAt, deadline } = calculateConfirmationWindow(input.assignmentDate, context.timezone);
	const arrivalDeadline = calculateArrivalDeadline(
		input.assignmentDate,
		context.timezone,
		input.routeStartTime
	);
	const isCancelable =
		input.assignmentDate > context.torontoToday && input.assignmentStatus !== 'cancelled';
	const isLateCancel = isCancelable && context.nowToronto >= deadline;
	const isToday = input.assignmentDate === context.torontoToday;

	return {
		confirmationOpensAt: opensAt,
		confirmationDeadline: deadline,
		isCancelable,
		isLateCancel,
		isConfirmable:
			!input.confirmedAt &&
			input.assignmentStatus === 'scheduled' &&
			context.nowToronto >= opensAt &&
			context.nowToronto <= deadline,
		isArrivable:
			isToday &&
			input.assignmentStatus === 'scheduled' &&
			input.confirmedAt !== null &&
			!input.shiftArrivedAt &&
			context.nowToronto < arrivalDeadline,
		isStartable:
			input.assignmentStatus === 'active' &&
			input.shiftArrivedAt !== null &&
			input.parcelsStart === null,
		isCompletable:
			input.assignmentStatus === 'active' &&
			input.parcelsStart !== null &&
			input.shiftCompletedAt === null
	};
}
