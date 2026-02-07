import { describe, expect, it } from 'vitest';

import {
	DRIVER_ROUTE_IA_CONTRACT,
	deriveAssignmentLifecycleState,
	deriveBidWindowLifecycleState,
	deriveDriverBidLifecycleState,
	getAssignmentActions,
	getBidWindowPrimaryAction,
	type AssignmentLifecycleSnapshot
} from '$lib/config/driverLifecycleIa';

function createAssignment(
	overrides: Partial<AssignmentLifecycleSnapshot> = {}
): AssignmentLifecycleSnapshot {
	return {
		status: 'scheduled',
		confirmedAt: null,
		isConfirmable: false,
		isCancelable: false,
		isArrivable: false,
		isStartable: false,
		isCompletable: false,
		shift: null,
		...overrides
	};
}

describe('driverLifecycleIa', () => {
	it('maps unconfirmed assignments to shared confirm/cancel actions', () => {
		const assignment = createAssignment({ isConfirmable: true, isCancelable: true });

		expect(deriveAssignmentLifecycleState(assignment)).toBe('scheduled_unconfirmed');
		expect(getAssignmentActions(assignment, 'schedule')).toEqual(['confirm_shift', 'cancel_shift']);
		expect(getAssignmentActions(assignment, 'dashboard')).toEqual([
			'confirm_shift',
			'cancel_shift'
		]);
	});

	it('routes arrive action to dashboard only', () => {
		const assignment = createAssignment({
			status: 'scheduled',
			confirmedAt: '2026-02-01T10:00:00.000Z',
			isArrivable: true
		});

		expect(deriveAssignmentLifecycleState(assignment)).toBe('scheduled_today_arrive');
		expect(getAssignmentActions(assignment, 'dashboard')).toEqual(['arrive_on_site']);
		expect(getAssignmentActions(assignment, 'schedule')).toEqual([]);
	});

	it('maps active lifecycle states to start and complete actions', () => {
		const startable = createAssignment({ status: 'active', isStartable: true });
		const completable = createAssignment({ status: 'active', isCompletable: true });

		expect(deriveAssignmentLifecycleState(startable)).toBe('active_inventory');
		expect(getAssignmentActions(startable, 'schedule')).toEqual(['record_inventory']);

		expect(deriveAssignmentLifecycleState(completable)).toBe('active_delivering');
		expect(getAssignmentActions(completable, 'schedule')).toEqual(['complete_shift']);
	});

	it('handles editable and locked completion windows', () => {
		const now = new Date('2026-02-07T10:00:00.000Z');
		const editable = createAssignment({
			status: 'completed',
			shift: {
				completedAt: '2026-02-07T09:00:00.000Z',
				editableUntil: '2026-02-07T11:00:00.000Z'
			}
		});
		const locked = createAssignment({
			status: 'completed',
			shift: {
				completedAt: '2026-02-07T09:00:00.000Z',
				editableUntil: '2026-02-07T09:30:00.000Z'
			}
		});

		expect(deriveAssignmentLifecycleState(editable, now)).toBe('completed_editable');
		expect(getAssignmentActions(editable, 'dashboard', now)).toEqual(['edit_completion']);

		expect(deriveAssignmentLifecycleState(locked, now)).toBe('completed_locked');
		expect(getAssignmentActions(locked, 'dashboard', now)).toEqual([]);
	});

	it('maps bid lifecycle states to primary actions', () => {
		expect(deriveBidWindowLifecycleState({ mode: 'competitive' })).toBe('bid_open_competitive');
		expect(deriveBidWindowLifecycleState({ mode: 'instant' })).toBe('bid_open_instant');
		expect(deriveBidWindowLifecycleState({ mode: 'emergency' })).toBe('bid_open_emergency');
		expect(getBidWindowPrimaryAction({ mode: 'competitive' })).toBe('submit_bid');
		expect(getBidWindowPrimaryAction({ mode: 'instant' })).toBe('accept_bid');
		expect(getBidWindowPrimaryAction({ mode: 'emergency' })).toBe('accept_bid');

		expect(deriveDriverBidLifecycleState({ status: 'pending' })).toBe('bid_pending');
		expect(deriveDriverBidLifecycleState({ status: 'won' })).toBe('bid_won');
		expect(deriveDriverBidLifecycleState({ status: 'lost' })).toBe('bid_lost');
	});

	it('declares route ownership for assignment and bid surfaces', () => {
		expect(DRIVER_ROUTE_IA_CONTRACT.dashboard.primaryActions).toContain('arrive_on_site');
		expect(DRIVER_ROUTE_IA_CONTRACT.schedule.primaryActions).toContain('confirm_shift');
		expect(DRIVER_ROUTE_IA_CONTRACT.bids.primaryActions).toContain('submit_bid');
	});
});
