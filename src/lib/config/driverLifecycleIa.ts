import type { AssignmentStatus } from '$lib/schemas/assignment';

export type DriverRouteSurface = 'dashboard' | 'schedule' | 'bids';

export type AssignmentLifecycleState =
	| 'scheduled_unconfirmed'
	| 'scheduled_confirmed'
	| 'scheduled_today_arrive'
	| 'active_inventory'
	| 'active_delivering'
	| 'completed_editable'
	| 'completed_locked'
	| 'cancelled'
	| 'unfilled';

export type BidLifecycleState =
	| 'bid_open_competitive'
	| 'bid_open_instant'
	| 'bid_open_emergency'
	| 'bid_pending'
	| 'bid_won'
	| 'bid_lost';

export type AssignmentLifecycleActionId =
	| 'confirm_shift'
	| 'arrive_on_site'
	| 'record_inventory'
	| 'complete_shift'
	| 'edit_completion'
	| 'cancel_shift';

export type BidLifecycleActionId = 'submit_bid' | 'accept_bid';

type OptionalIsoDate = string | Date | null;

export interface LifecycleShiftSnapshot {
	completedAt: OptionalIsoDate;
	editableUntil: OptionalIsoDate;
}

export interface AssignmentLifecycleSnapshot {
	status: AssignmentStatus;
	confirmedAt: OptionalIsoDate;
	isConfirmable: boolean;
	isCancelable: boolean;
	isArrivable: boolean;
	isStartable: boolean;
	isCompletable: boolean;
	shift: LifecycleShiftSnapshot | null;
}

export interface BidWindowLifecycleSnapshot {
	mode: 'competitive' | 'instant' | 'emergency';
}

export interface DriverBidLifecycleSnapshot {
	status: 'pending' | 'won' | 'lost';
}

export const DRIVER_ROUTE_IA_CONTRACT = {
	dashboard: {
		intent: 'Drive day-of execution from one mobile-first action hub.',
		ownedAssignmentStates: [
			'scheduled_today_arrive',
			'active_inventory',
			'active_delivering',
			'completed_editable'
		] as const,
		primaryActions: [
			'arrive_on_site',
			'record_inventory',
			'complete_shift',
			'edit_completion'
		] as const
	},
	schedule: {
		intent: 'Manage upcoming commitments and fallback planning windows.',
		ownedAssignmentStates: [
			'scheduled_unconfirmed',
			'scheduled_confirmed',
			'completed_locked',
			'cancelled',
			'unfilled'
		] as const,
		primaryActions: ['confirm_shift', 'cancel_shift'] as const
	},
	bids: {
		intent: 'Recover coverage through competitive, instant, and emergency bidding.',
		ownedBidStates: [
			'bid_open_competitive',
			'bid_open_instant',
			'bid_open_emergency',
			'bid_pending',
			'bid_won',
			'bid_lost'
		] as const,
		primaryActions: ['submit_bid', 'accept_bid'] as const
	}
} as const;

const ASSIGNMENT_STATE_ACTION_CONTRACT = {
	scheduled_unconfirmed: ['confirm_shift', 'cancel_shift'],
	scheduled_confirmed: ['cancel_shift'],
	scheduled_today_arrive: ['arrive_on_site'],
	active_inventory: ['record_inventory'],
	active_delivering: ['complete_shift'],
	completed_editable: ['edit_completion'],
	completed_locked: [],
	cancelled: [],
	unfilled: []
} as const satisfies Record<AssignmentLifecycleState, readonly AssignmentLifecycleActionId[]>;

const ASSIGNMENT_ACTION_SURFACES: Record<
	AssignmentLifecycleActionId,
	readonly DriverRouteSurface[]
> = {
	confirm_shift: ['dashboard', 'schedule'],
	arrive_on_site: ['dashboard'],
	record_inventory: ['dashboard', 'schedule'],
	complete_shift: ['dashboard', 'schedule'],
	edit_completion: ['dashboard'],
	cancel_shift: ['dashboard', 'schedule']
};

function asDate(value: OptionalIsoDate): Date | null {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value : new Date(value);
}

export function deriveAssignmentLifecycleState(
	input: AssignmentLifecycleSnapshot,
	now: Date = new Date()
): AssignmentLifecycleState {
	if (input.status === 'cancelled') {
		return 'cancelled';
	}

	if (input.status === 'unfilled') {
		return 'unfilled';
	}

	const completedAt = asDate(input.shift?.completedAt ?? null);
	if (completedAt) {
		const editableUntil = asDate(input.shift?.editableUntil ?? null);
		if (editableUntil && now < editableUntil) {
			return 'completed_editable';
		}

		return 'completed_locked';
	}

	if (input.isStartable) {
		return 'active_inventory';
	}

	if (input.isCompletable || input.status === 'active') {
		return 'active_delivering';
	}

	if (input.isArrivable) {
		return 'scheduled_today_arrive';
	}

	if (input.status === 'scheduled' && !input.confirmedAt) {
		return 'scheduled_unconfirmed';
	}

	return 'scheduled_confirmed';
}

function isActionEnabledForState(
	actionId: AssignmentLifecycleActionId,
	state: AssignmentLifecycleState,
	input: AssignmentLifecycleSnapshot
): boolean {
	switch (actionId) {
		case 'confirm_shift':
			return input.isConfirmable;
		case 'arrive_on_site':
			return state === 'scheduled_today_arrive' && input.isArrivable;
		case 'record_inventory':
			return state === 'active_inventory' && input.isStartable;
		case 'complete_shift':
			return state === 'active_delivering' && input.isCompletable;
		case 'edit_completion':
			return state === 'completed_editable';
		case 'cancel_shift':
			return input.isCancelable;
	}
}

export function getAssignmentActions(
	input: AssignmentLifecycleSnapshot,
	surface: DriverRouteSurface,
	now: Date = new Date()
): AssignmentLifecycleActionId[] {
	const state = deriveAssignmentLifecycleState(input, now);

	return ASSIGNMENT_STATE_ACTION_CONTRACT[state].filter(
		(actionId) =>
			ASSIGNMENT_ACTION_SURFACES[actionId].includes(surface) &&
			isActionEnabledForState(actionId, state, input)
	);
}

export function deriveBidWindowLifecycleState(
	window: BidWindowLifecycleSnapshot
): BidLifecycleState {
	if (window.mode === 'competitive') {
		return 'bid_open_competitive';
	}

	if (window.mode === 'instant') {
		return 'bid_open_instant';
	}

	return 'bid_open_emergency';
}

export function deriveDriverBidLifecycleState(bid: DriverBidLifecycleSnapshot): BidLifecycleState {
	if (bid.status === 'won') {
		return 'bid_won';
	}

	if (bid.status === 'lost') {
		return 'bid_lost';
	}

	return 'bid_pending';
}

export function getBidWindowPrimaryAction(
	window: BidWindowLifecycleSnapshot
): BidLifecycleActionId {
	return window.mode === 'competitive' ? 'submit_bid' : 'accept_bid';
}
