import { addMilliseconds } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';

import {
	calculateConfirmationWindow,
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';

function createTorontoContext(nowToronto: Date) {
	return {
		nowToronto,
		torontoToday: formatInTimeZone(nowToronto, 'America/Toronto', 'yyyy-MM-dd'),
		timezone: 'America/Toronto'
	} as const;
}

describe('LC-05 lifecycle service: deriveAssignmentLifecycle', () => {
	it('calculates confirmation window boundaries inclusively', () => {
		const assignmentDate = '2026-02-20';
		const { opensAt, deadline } = calculateConfirmationWindow(assignmentDate);

		const atOpen = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			createTorontoContext(opensAt)
		);

		const beforeOpen = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			createTorontoContext(addMilliseconds(opensAt, -1))
		);

		const atDeadline = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			createTorontoContext(deadline)
		);

		const afterDeadline = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			createTorontoContext(addMilliseconds(deadline, 1))
		);

		expect(atOpen.confirmationOpensAt.toISOString()).toBe(opensAt.toISOString());
		expect(atOpen.confirmationDeadline.toISOString()).toBe(deadline.toISOString());
		expect(atOpen.isConfirmable).toBe(true);
		expect(beforeOpen.isConfirmable).toBe(false);
		expect(atDeadline.isConfirmable).toBe(true);
		expect(afterDeadline.isConfirmable).toBe(false);
	});

	it('applies cancelability and late-cancel boundaries', () => {
		const contextAtBoundary = createAssignmentLifecycleContext(
			new Date('2026-02-10T12:00:00.000Z')
		);

		const today = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-10',
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			contextAtBoundary
		);

		const exactlyFortyEightHours = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-12',
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			contextAtBoundary
		);

		const contextJustOverBoundary = createAssignmentLifecycleContext(
			new Date('2026-02-10T11:59:00.000Z')
		);

		const justOverFortyEightHours = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-12',
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			contextJustOverBoundary
		);

		expect(today.isCancelable).toBe(false);
		expect(today.isLateCancel).toBe(false);
		expect(exactlyFortyEightHours.isCancelable).toBe(true);
		expect(exactlyFortyEightHours.isLateCancel).toBe(true);
		expect(justOverFortyEightHours.isLateCancel).toBe(false);
	});

	it('derives late-cancel boundary from route start time when provided', () => {
		const assignmentDate = '2026-02-12';
		const { deadline } = calculateConfirmationWindow(assignmentDate, 'America/Toronto', '11:00');

		const beforeDeadline = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null,
				routeStartTime: '11:00'
			},
			createTorontoContext(addMilliseconds(deadline, -1))
		);

		const atDeadline = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null,
				routeStartTime: '11:00'
			},
			createTorontoContext(deadline)
		);

		const afterDeadline = deriveAssignmentLifecycle(
			{
				assignmentDate,
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null,
				routeStartTime: '11:00'
			},
			createTorontoContext(addMilliseconds(deadline, 1))
		);

		expect(beforeDeadline.isCancelable).toBe(true);
		expect(beforeDeadline.isLateCancel).toBe(false);
		expect(atDeadline.isLateCancel).toBe(true);
		expect(afterDeadline.isLateCancel).toBe(true);
	});

	it('derives arrive, start, and complete states', () => {
		const context = createAssignmentLifecycleContext(new Date('2026-02-10T13:00:00.000Z'));
		const confirmedAt = new Date('2026-02-08T13:00:00.000Z');

		const arrivable = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-10',
				assignmentStatus: 'scheduled',
				confirmedAt,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			context
		);

		const startable = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-10',
				assignmentStatus: 'active',
				confirmedAt,
				shiftArrivedAt: new Date('2026-02-10T13:00:00.000Z'),
				parcelsStart: null,
				shiftCompletedAt: null
			},
			context
		);

		const completable = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-10',
				assignmentStatus: 'active',
				confirmedAt,
				shiftArrivedAt: new Date('2026-02-10T13:00:00.000Z'),
				parcelsStart: 120,
				shiftCompletedAt: null
			},
			context
		);

		expect(arrivable.isArrivable).toBe(true);
		expect(arrivable.isStartable).toBe(false);
		expect(arrivable.isCompletable).toBe(false);
		expect(startable.isArrivable).toBe(false);
		expect(startable.isStartable).toBe(true);
		expect(startable.isCompletable).toBe(false);
		expect(completable.isStartable).toBe(false);
		expect(completable.isCompletable).toBe(true);
	});

	it('marks arrivals as unavailable at and after the 9 AM Toronto cutoff', () => {
		const confirmedAt = new Date('2026-02-08T13:00:00.000Z');

		const beforeCutoff = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-10',
				assignmentStatus: 'scheduled',
				confirmedAt,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			createAssignmentLifecycleContext(new Date('2026-02-10T13:59:59.000Z'))
		);

		const atCutoff = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-10',
				assignmentStatus: 'scheduled',
				confirmedAt,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			createAssignmentLifecycleContext(new Date('2026-02-10T14:00:00.000Z'))
		);

		expect(beforeCutoff.isArrivable).toBe(true);
		expect(atCutoff.isArrivable).toBe(false);
	});

	it('keeps confirmation boundaries anchored to exact 48h/7d durations across DST transitions', () => {
		const springForward = calculateConfirmationWindow('2026-03-08');
		const fallBack = calculateConfirmationWindow('2026-11-01');
		const springForwardShiftStart = new Date('2026-03-08T11:00:00.000Z');
		const fallBackShiftStart = new Date('2026-11-01T12:00:00.000Z');

		expect(springForwardShiftStart.getTime() - springForward.opensAt.getTime()).toBe(
			168 * 60 * 60 * 1000
		);
		expect(springForwardShiftStart.getTime() - springForward.deadline.getTime()).toBe(
			48 * 60 * 60 * 1000
		);

		expect(formatInTimeZone(springForward.opensAt, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-03-01 06:00'
		);
		expect(formatInTimeZone(springForward.deadline, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-03-06 06:00'
		);

		expect(fallBackShiftStart.getTime() - fallBack.opensAt.getTime()).toBe(168 * 60 * 60 * 1000);
		expect(fallBackShiftStart.getTime() - fallBack.deadline.getTime()).toBe(48 * 60 * 60 * 1000);

		expect(formatInTimeZone(fallBack.opensAt, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-10-25 08:00'
		);
		expect(formatInTimeZone(fallBack.deadline, 'America/Toronto', 'yyyy-MM-dd HH:mm')).toBe(
			'2026-10-30 08:00'
		);
	});

	it('uses Toronto date context when UTC date differs', () => {
		const context = createAssignmentLifecycleContext(new Date('2026-02-11T03:30:00.000Z'));

		const output = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-11',
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			context
		);

		expect(context.torontoToday).toBe('2026-02-10');
		expect(output.isCancelable).toBe(true);
	});

	it('is idempotent for repeated evaluations with identical input', () => {
		const context = createAssignmentLifecycleContext(new Date('2026-02-10T15:00:00.000Z'));
		const input = {
			assignmentDate: '2026-02-12',
			assignmentStatus: 'scheduled' as const,
			confirmedAt: null,
			shiftArrivedAt: null,
			parcelsStart: null,
			shiftCompletedAt: null
		};

		const first = deriveAssignmentLifecycle(input, context);
		const second = deriveAssignmentLifecycle(input, context);

		expect(second).toEqual(first);
	});

	it('never marks cancelled assignments as cancelable or late-cancel', () => {
		const context = createAssignmentLifecycleContext(new Date('2026-02-10T05:00:00.000Z'));

		const cancelled = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-13',
				assignmentStatus: 'cancelled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			context
		);

		expect(cancelled.isCancelable).toBe(false);
		expect(cancelled.isLateCancel).toBe(false);
	});
});
