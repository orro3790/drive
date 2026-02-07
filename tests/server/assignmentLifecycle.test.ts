import { addMilliseconds } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { format } from 'date-fns-tz';

import {
	calculateConfirmationWindow,
	createAssignmentLifecycleContext,
	deriveAssignmentLifecycle
} from '$lib/server/services/assignmentLifecycle';

function createTorontoContext(nowToronto: Date) {
	return {
		nowToronto,
		torontoToday: format(nowToronto, 'yyyy-MM-dd'),
		timezone: 'America/Toronto'
	} as const;
}

describe('deriveAssignmentLifecycle', () => {
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
		const contextAtMidnight = createAssignmentLifecycleContext(
			new Date('2026-02-10T05:00:00.000Z')
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
			contextAtMidnight
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
			contextAtMidnight
		);

		const contextJustBeforeMidnight = createAssignmentLifecycleContext(
			new Date('2026-02-11T04:59:00.000Z')
		);

		const justOverFortyEightHours = deriveAssignmentLifecycle(
			{
				assignmentDate: '2026-02-13',
				assignmentStatus: 'scheduled',
				confirmedAt: null,
				shiftArrivedAt: null,
				parcelsStart: null,
				shiftCompletedAt: null
			},
			contextJustBeforeMidnight
		);

		expect(today.isCancelable).toBe(false);
		expect(today.isLateCancel).toBe(false);
		expect(exactlyFortyEightHours.isCancelable).toBe(true);
		expect(exactlyFortyEightHours.isLateCancel).toBe(true);
		expect(justOverFortyEightHours.isLateCancel).toBe(false);
	});

	it('derives arrive, start, and complete states', () => {
		const context = createAssignmentLifecycleContext(new Date('2026-02-10T15:00:00.000Z'));
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
});
