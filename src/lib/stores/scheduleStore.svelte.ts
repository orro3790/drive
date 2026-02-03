/**
 * Schedule Store
 *
 * Manages driver schedule state and cancellation actions.
 */

import type { AssignmentStatus, CancelReason } from '$lib/schemas/assignment';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';

export type ScheduleAssignment = {
	id: string;
	date: string;
	status: AssignmentStatus;
	routeName: string;
	warehouseName: string;
	isCancelable: boolean;
	isLateCancel: boolean;
};

const state = $state<{
	assignments: ScheduleAssignment[];
	weekStart: string | null;
	nextWeekStart: string | null;
	isLoading: boolean;
	isCancelling: boolean;
	error: string | null;
}>({
	assignments: [],
	weekStart: null,
	nextWeekStart: null,
	isLoading: false,
	isCancelling: false,
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

	async cancel(assignmentId: string, reason: CancelReason) {
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
	}
};
