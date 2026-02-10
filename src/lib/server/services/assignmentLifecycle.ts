import { fromZonedTime } from 'date-fns-tz';

import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import type { AssignmentStatus } from '$lib/schemas/assignment';
import {
	addDaysToDateString,
	getTorontoDateTimeInstant,
	toTorontoDateString
} from '$lib/server/time/toronto';

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
	timezone: string = dispatchPolicy.timezone.toronto
): Date {
	if (timezone === dispatchPolicy.timezone.toronto) {
		return getTorontoDateTimeInstant(assignmentDate, {
			hours: dispatchPolicy.shifts.arrivalDeadlineHourLocal
		});
	}

	const localDateTime = `${assignmentDate}T${String(dispatchPolicy.shifts.arrivalDeadlineHourLocal).padStart(2, '0')}:00:00`;
	return fromZonedTime(localDateTime, timezone);
}

export function calculateConfirmationWindow(
	assignmentDate: string,
	timezone: string = dispatchPolicy.timezone.toronto
): { opensAt: Date; deadline: Date } {
	const opensAtDate = addDaysToDateString(
		assignmentDate,
		-dispatchPolicy.confirmation.windowDaysBeforeShift
	);
	const deadlineDate = addDaysToDateString(
		assignmentDate,
		-(dispatchPolicy.confirmation.deadlineHoursBeforeShift / 24)
	);
	const opensAt = getShiftStart(opensAtDate, timezone);
	const deadline = getShiftStart(deadlineDate, timezone);

	return { opensAt, deadline };
}

export function deriveAssignmentLifecycle(
	input: AssignmentLifecycleInput,
	context: AssignmentLifecycleContext
): AssignmentLifecycleOutput {
	const { opensAt, deadline } = calculateConfirmationWindow(input.assignmentDate, context.timezone);
	const arrivalDeadline = calculateArrivalDeadline(input.assignmentDate, context.timezone);
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
