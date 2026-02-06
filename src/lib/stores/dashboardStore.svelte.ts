/**
 * Dashboard Store
 *
 * Manages driver dashboard state: today's shift, schedule summaries,
 * metrics, and pending bids.
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

export type DashboardAssignment = {
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

export type UnconfirmedShift = {
	id: string;
	date: string;
	routeName: string;
	confirmationOpensAt: string;
	confirmationDeadline: string;
	isConfirmable: boolean;
};

export type WeekSummary = {
	weekStart: string;
	assignedDays: number;
	assignments: DashboardAssignment[];
};

export type DriverMetrics = {
	totalShifts: number;
	completedShifts: number;
	attendanceRate: number;
	completionRate: number;
};

export type PendingBid = {
	id: string;
	assignmentId: string;
	assignmentDate: string;
	routeName: string;
	warehouseName: string;
	bidAt: string;
	windowClosesAt: string;
};

const state = $state<{
	todayShift: DashboardAssignment | null;
	thisWeek: WeekSummary | null;
	nextWeek: WeekSummary | null;
	metrics: DriverMetrics;
	pendingBids: PendingBid[];
	unconfirmedShifts: UnconfirmedShift[];
	isNewDriver: boolean;
	isLoading: boolean;
	isStartingShift: boolean;
	isCompletingShift: boolean;
	isCancelling: boolean;
	isConfirming: boolean;
	error: string | null;
}>({
	todayShift: null,
	thisWeek: null,
	nextWeek: null,
	metrics: {
		totalShifts: 0,
		completedShifts: 0,
		attendanceRate: 0,
		completionRate: 0
	},
	pendingBids: [],
	unconfirmedShifts: [],
	isNewDriver: false,
	isLoading: false,
	isStartingShift: false,
	isCompletingShift: false,
	isCancelling: false,
	isConfirming: false,
	error: null
});

export const dashboardStore = {
	get todayShift() {
		return state.todayShift;
	},
	get thisWeek() {
		return state.thisWeek;
	},
	get nextWeek() {
		return state.nextWeek;
	},
	get metrics() {
		return state.metrics;
	},
	get pendingBids() {
		return state.pendingBids;
	},
	get unconfirmedShifts() {
		return state.unconfirmedShifts;
	},
	get isConfirming() {
		return state.isConfirming;
	},
	get isNewDriver() {
		return state.isNewDriver;
	},
	get isLoading() {
		return state.isLoading;
	},
	get isStartingShift() {
		return state.isStartingShift;
	},
	get isCompletingShift() {
		return state.isCompletingShift;
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
			const [dashboardRes, metricsRes] = await Promise.all([
				fetch('/api/dashboard'),
				fetch('/api/metrics').catch(() => null)
			]);

			if (!dashboardRes.ok) {
				throw new Error('Failed to load dashboard');
			}

			const dashboardData = await dashboardRes.json();
			const metricsData = metricsRes?.ok ? await metricsRes.json() : null;

			state.todayShift = dashboardData.todayShift ?? null;
			state.thisWeek = dashboardData.thisWeek ?? null;
			state.nextWeek = dashboardData.nextWeek ?? null;
			state.metrics = metricsData?.metrics ??
				dashboardData.metrics ?? {
					totalShifts: 0,
					completedShifts: 0,
					attendanceRate: 0,
					completionRate: 0
				};
			state.pendingBids = dashboardData.pendingBids ?? [];
			state.unconfirmedShifts = dashboardData.unconfirmedShifts ?? [];
			state.isNewDriver = dashboardData.isNewDriver ?? false;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.dashboard_load_error());
		} finally {
			state.isLoading = false;
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

			// Reload dashboard to get updated state
			await this.load();

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

			// Reload dashboard to get updated state
			await this.load();

			toastStore.success(m.shift_complete_success());
			return true;
		} catch (err) {
			toastStore.error(m.shift_complete_error());
			return false;
		} finally {
			state.isCompletingShift = false;
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
				const data = await res.json().catch(() => null);
				throw new Error(data?.message ?? 'Failed to confirm shift');
			}

			// Remove from unconfirmedShifts locally
			state.unconfirmedShifts = state.unconfirmedShifts.filter((s) => s.id !== assignmentId);

			// Update the assignment in week summaries
			const updateAssignment = (a: DashboardAssignment) => {
				if (a.id === assignmentId) {
					return { ...a, confirmedAt: new Date().toISOString(), isConfirmable: false };
				}
				return a;
			};

			if (state.thisWeek) {
				state.thisWeek = {
					...state.thisWeek,
					assignments: state.thisWeek.assignments.map(updateAssignment)
				};
			}
			if (state.nextWeek) {
				state.nextWeek = {
					...state.nextWeek,
					assignments: state.nextWeek.assignments.map(updateAssignment)
				};
			}

			toastStore.success('Shift confirmed!');
			return true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to confirm shift';
			toastStore.error(message);
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

			// Reload dashboard to get updated state
			await this.load();

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
