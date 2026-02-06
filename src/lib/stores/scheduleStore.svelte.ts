/**
 * Schedule Store
 *
 * Manages driver schedule state and cancellation actions.
 */

import type { AssignmentStatus, CancelReason } from '$lib/schemas/assignment';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';

export type ShiftData = {
	id: string;
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	startedAt: string | null;
	completedAt: string | null;
};

export type ScheduleAssignment = {
	id: string;
	date: string;
	status: AssignmentStatus;
	confirmedAt: string | null;
	confirmationOpensAt: string;
	confirmationDeadline: string;
	isConfirmable: boolean;
	routeName: string;
	warehouseName: string;
	isCancelable: boolean;
	isLateCancel: boolean;
	isStartable: boolean;
	isCompletable: boolean;
	shift: ShiftData | null;
};

const state = $state<{
	assignments: ScheduleAssignment[];
	weekStart: string | null;
	nextWeekStart: string | null;
	isLoading: boolean;
	isCancelling: boolean;
	isStartingShift: boolean;
	isCompletingShift: boolean;
	isConfirming: boolean;
	error: string | null;
}>({
	assignments: [],
	weekStart: null,
	nextWeekStart: null,
	isLoading: false,
	isCancelling: false,
	isStartingShift: false,
	isCompletingShift: false,
	isConfirming: false,
	error: null
});

export const scheduleStore = {
	get assignments() {
		return state.assignments;
	},
	get weekStart() {
		return state.weekStart;
	},
	get nextWeekStart() {
		return state.nextWeekStart;
	},
	get isLoading() {
		return state.isLoading;
	},
	get isCancelling() {
		return state.isCancelling;
	},
	get isStartingShift() {
		return state.isStartingShift;
	},
	get isCompletingShift() {
		return state.isCompletingShift;
	},
	get isConfirming() {
		return state.isConfirming;
	},
	get error() {
		return state.error;
	},

	async load() {
		state.isLoading = true;
		state.error = null;

		try {
			const res = await fetch('/api/assignments/mine');
			if (!res.ok) {
				throw new Error('Failed to load schedule');
			}

			const data = await res.json();
			state.assignments = data.assignments ?? [];
			state.weekStart = data.weekStart ?? null;
			state.nextWeekStart = data.nextWeekStart ?? null;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.schedule_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	async confirmShift(assignmentId: string) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isConfirming = true;

		try {
			const res = await fetch(`/api/assignments/${assignmentId}/confirm`, {
				method: 'POST'
			});

			if (!res.ok) {
				throw new Error('Failed to confirm shift');
			}

			state.assignments = state.assignments.map((item) =>
				item.id === assignmentId
					? { ...item, confirmedAt: new Date().toISOString(), isConfirmable: false }
					: item
			);

			toastStore.success('Shift confirmed!');
			return true;
		} catch (err) {
			toastStore.error('Failed to confirm shift');
			return false;
		} finally {
			state.isConfirming = false;
		}
	},

	async cancel(assignmentId: string, reason: CancelReason) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isCancelling = true;

		try {
			const res = await fetch(`/api/assignments/${assignmentId}/cancel`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reason })
			});

			if (!res.ok) {
				throw new Error('Failed to cancel assignment');
			}

			const { assignment } = await res.json();
			if (assignment?.id) {
				state.assignments = state.assignments.map((item) =>
					item.id === assignment.id
						? {
								...item,
								status: assignment.status,
								isCancelable: false
							}
						: item
				);
			}

			toastStore.success(m.schedule_cancel_success());
			return true;
		} catch (err) {
			toastStore.error(m.schedule_cancel_error());
			return false;
		} finally {
			state.isCancelling = false;
		}
	},

	async startShift(assignmentId: string, parcelsStart: number) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isStartingShift = true;

		try {
			const res = await fetch('/api/shifts/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentId, parcelsStart })
			});

			if (!res.ok) {
				throw new Error('Failed to start shift');
			}

			const { shift, assignmentStatus } = await res.json();

			state.assignments = state.assignments.map((item) =>
				item.id === assignmentId
					? {
							...item,
							status: assignmentStatus,
							isStartable: false,
							isCompletable: true,
							isCancelable: false,
							shift: {
								id: shift.id,
								parcelsStart: shift.parcelsStart,
								parcelsDelivered: null,
								parcelsReturned: null,
								startedAt: shift.startedAt,
								completedAt: null
							}
						}
					: item
			);

			toastStore.success(m.shift_start_success());
			return true;
		} catch (err) {
			toastStore.error(m.shift_start_error());
			return false;
		} finally {
			state.isStartingShift = false;
		}
	},

	async completeShift(assignmentId: string, parcelsDelivered: number, parcelsReturned: number) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isCompletingShift = true;

		try {
			const res = await fetch('/api/shifts/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentId, parcelsDelivered, parcelsReturned })
			});

			if (!res.ok) {
				throw new Error('Failed to complete shift');
			}

			const { shift, assignmentStatus } = await res.json();

			state.assignments = state.assignments.map((item) =>
				item.id === assignmentId
					? {
							...item,
							status: assignmentStatus,
							isStartable: false,
							isCompletable: false,
							isCancelable: false,
							shift: {
								id: shift.id,
								parcelsStart: shift.parcelsStart,
								parcelsDelivered: shift.parcelsDelivered,
								parcelsReturned: shift.parcelsReturned,
								startedAt: shift.startedAt,
								completedAt: shift.completedAt
							}
						}
					: item
			);

			toastStore.success(m.shift_complete_success());
			return true;
		} catch (err) {
			toastStore.error(m.shift_complete_error());
			return false;
		} finally {
			state.isCompletingShift = false;
		}
	}
};
