import { addDays, addHours, differenceInCalendarDays, parseISO, set } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';

import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import type { AssignmentStatus } from '$lib/schemas/assignment';

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
	const nowToronto = toZonedTime(now, timezone);

	return {
		nowToronto,
		torontoToday: format(nowToronto, 'yyyy-MM-dd'),
		timezone
	};
}

function getShiftStart(assignmentDate: string, timezone: string): Date {
	const parsed = parseISO(assignmentDate);
	const toronto = toZonedTime(parsed, timezone);

	return set(toronto, {
		hours: dispatchPolicy.shifts.startHourLocal,
		minutes: 0,
		seconds: 0,
		milliseconds: 0
	});
}

function calculateHoursUntilShift(
	assignmentDate: string,
	nowToronto: Date,
	torontoToday: string
): number {
	const dayDiff = differenceInCalendarDays(parseISO(assignmentDate), parseISO(torontoToday));
	const currentMinutes = nowToronto.getHours() * 60 + nowToronto.getMinutes();

	return (dayDiff * 24 * 60 - currentMinutes) / 60;
}

export function calculateConfirmationWindow(
	assignmentDate: string,
	timezone: string = dispatchPolicy.timezone.toronto
): { opensAt: Date; deadline: Date } {
	const shiftStart = getShiftStart(assignmentDate, timezone);
	const opensAt = addDays(shiftStart, -dispatchPolicy.confirmation.windowDaysBeforeShift);
	const deadline = addHours(shiftStart, -dispatchPolicy.confirmation.deadlineHoursBeforeShift);

	return { opensAt, deadline };
}

export function deriveAssignmentLifecycle(
	input: AssignmentLifecycleInput,
	context: AssignmentLifecycleContext
): AssignmentLifecycleOutput {
	const { opensAt, deadline } = calculateConfirmationWindow(input.assignmentDate, context.timezone);
	const isCancelable =
		input.assignmentDate > context.torontoToday && input.assignmentStatus !== 'cancelled';
	const hoursUntilShift = calculateHoursUntilShift(
		input.assignmentDate,
		context.nowToronto,
		context.torontoToday
	);
	const isLateCancel =
		isCancelable && hoursUntilShift <= dispatchPolicy.confirmation.deadlineHoursBeforeShift;
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
			!input.shiftArrivedAt,
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
