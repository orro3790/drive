/**
 * Dashboard Store
 *
 * Manages driver dashboard state: today's shift, schedule summaries,
 * metrics, and pending bids.
 */

import {
	assignmentStatusSchema,
	type AssignmentStatus,
	type CancelReason
} from '$lib/schemas/assignment';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';
import { z } from 'zod';

export type ShiftData = {
	id: string;
	arrivedAt: string | null;
	parcelsStart: number | null;
	parcelsDelivered: number | null;
	parcelsReturned: number | null;
	exceptedReturns: number;
	exceptionNotes: string | null;
	startedAt: string | null;
	completedAt: string | null;
	editableUntil: string | null;
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
	routeStartTime: string;
	warehouseName: string;
	isCancelable: boolean;
	isLateCancel: boolean;
	isArrivable: boolean;
	isStartable: boolean;
	isCompletable: boolean;
	shift: ShiftData | null;
};

export type UpcomingShift = {
	id: string;
	date: string;
	routeName: string;
	routeStartTime: string;
	warehouseName: string;
	confirmationOpensAt: string;
	confirmationDeadline: string;
	isConfirmable: boolean;
	confirmedAt: string | null;
};

/** @deprecated Use UpcomingShift instead */
export type UnconfirmedShift = UpcomingShift;

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
	totalAssigned: number;
	avgParcelsDelivered: number;
};

export type PendingBid = {
	id: string;
	assignmentId: string;
	assignmentDate: string;
	routeName: string;
	routeStartTime: string;
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
	unconfirmedShifts: UpcomingShift[];
	isNewDriver: boolean;
	isLoading: boolean;
	isArriving: boolean;
	isStartingShift: boolean;
	isCompletingShift: boolean;
	isEditingShift: boolean;
	isCancelling: boolean;
	isConfirming: boolean;
	error: string | null;
	/** Version tick — increments on each state refresh to force dependent re-computation */
	tick: number;
}>({
	todayShift: null,
	thisWeek: null,
	nextWeek: null,
	metrics: {
		totalShifts: 0,
		completedShifts: 0,
		attendanceRate: 0,
		completionRate: 0,
		totalAssigned: 0,
		avgParcelsDelivered: 0
	},
	pendingBids: [],
	unconfirmedShifts: [],
	isNewDriver: false,
	isLoading: false,
	isArriving: false,
	isStartingShift: false,
	isCompletingShift: false,
	isEditingShift: false,
	isCancelling: false,
	isConfirming: false,
	error: null,
	tick: 0
});

const shiftDataSchema = z.object({
	id: z.string().min(1),
	arrivedAt: z.string().min(1).nullable(),
	parcelsStart: z.number().int().nonnegative().nullable(),
	parcelsDelivered: z.number().int().nonnegative().nullable(),
	parcelsReturned: z.number().int().nonnegative().nullable(),
	exceptedReturns: z.number().int().nonnegative().default(0),
	exceptionNotes: z.string().nullable().default(null),
	startedAt: z.string().min(1).nullable(),
	completedAt: z.string().min(1).nullable(),
	editableUntil: z.string().min(1).nullable()
});

const dashboardAssignmentSchema = z.object({
	id: z.string().min(1),
	date: z.string().min(1),
	status: assignmentStatusSchema,
	confirmedAt: z.string().min(1).nullable(),
	confirmationOpensAt: z.string().min(1),
	confirmationDeadline: z.string().min(1),
	isConfirmable: z.boolean(),
	routeName: z.string().min(1),
	routeStartTime: z.string().min(1),
	warehouseName: z.string().min(1),
	isCancelable: z.boolean(),
	isLateCancel: z.boolean(),
	isArrivable: z.boolean(),
	isStartable: z.boolean(),
	isCompletable: z.boolean(),
	shift: shiftDataSchema.nullable()
});

const upcomingShiftSchema = z.object({
	id: z.string().min(1),
	date: z.string().min(1),
	routeName: z.string().min(1),
	routeStartTime: z.string().min(1),
	warehouseName: z.string().min(1),
	confirmationOpensAt: z.string().min(1),
	confirmationDeadline: z.string().min(1),
	isConfirmable: z.boolean(),
	confirmedAt: z.string().min(1).nullable()
});

const weekSummarySchema = z.object({
	weekStart: z.string().min(1),
	assignedDays: z.number().int().nonnegative(),
	assignments: z.array(dashboardAssignmentSchema)
});

const driverMetricsSchema = z.object({
	totalShifts: z.number().int().nonnegative(),
	completedShifts: z.number().int().nonnegative(),
	attendanceRate: z.number().nonnegative(),
	completionRate: z.number().nonnegative(),
	totalAssigned: z.number().int().nonnegative(),
	avgParcelsDelivered: z.number().nonnegative()
});

const pendingBidSchema = z.object({
	id: z.string().min(1),
	assignmentId: z.string().min(1),
	assignmentDate: z.string().min(1),
	routeName: z.string().min(1),
	routeStartTime: z.string().min(1),
	warehouseName: z.string().min(1),
	bidAt: z.string().min(1),
	windowClosesAt: z.string().min(1)
});

const dashboardResponseSchema = z.object({
	todayShift: dashboardAssignmentSchema.nullable().optional(),
	thisWeek: weekSummarySchema.nullable().optional(),
	nextWeek: weekSummarySchema.nullable().optional(),
	metrics: driverMetricsSchema.optional(),
	pendingBids: z.array(pendingBidSchema).optional(),
	unconfirmedShifts: z.array(upcomingShiftSchema).optional(),
	isNewDriver: z.boolean().optional()
});

const metricsApiResponseSchema = z.object({
	metrics: z.object({
		totalShifts: z.number().int().nonnegative(),
		completedShifts: z.number().int().nonnegative(),
		attendanceRate: z.number().nonnegative(),
		completionRate: z.number().nonnegative(),
		totalAssigned: z.number().int().nonnegative().optional(),
		avgParcelsDelivered: z.number().nonnegative().optional()
	})
});

const confirmShiftResponseSchema = z.object({
	success: z.literal(true),
	confirmedAt: z.string().min(1)
});

const shiftCompleteResponseSchema = z.object({
	shift: z.object({
		id: z.string().min(1),
		parcelsStart: z.number().int().nonnegative(),
		parcelsDelivered: z.number().int().nonnegative(),
		parcelsReturned: z.number().int().nonnegative(),
		exceptedReturns: z.number().int().nonnegative().default(0),
		exceptionNotes: z.string().nullable().default(null),
		startedAt: z.string().min(1).nullable(),
		completedAt: z.string().min(1).nullable(),
		editableUntil: z.string().min(1).nullable()
	}),
	assignmentStatus: assignmentStatusSchema
});

const emptyDriverMetrics: DriverMetrics = {
	totalShifts: 0,
	completedShifts: 0,
	attendanceRate: 0,
	completionRate: 0,
	totalAssigned: 0,
	avgParcelsDelivered: 0
};

const mutationVersions = new Map<string, number>();

function nextMutationVersion(mutationKey: string): number {
	const version = (mutationVersions.get(mutationKey) ?? 0) + 1;
	mutationVersions.set(mutationKey, version);
	return version;
}

function isLatestMutationVersion(mutationKey: string, version: number): boolean {
	return (mutationVersions.get(mutationKey) ?? 0) === version;
}

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
	get isArriving() {
		return state.isArriving;
	},
	get isStartingShift() {
		return state.isStartingShift;
	},
	get isCompletingShift() {
		return state.isCompletingShift;
	},
	get isEditingShift() {
		return state.isEditingShift;
	},
	get isCancelling() {
		return state.isCancelling;
	},
	get error() {
		return state.error;
	},
	/** Version tick — read this in $derived to force re-computation on state changes */
	get tick() {
		return state.tick;
	},

	async load() {
		state.isLoading = true;
		state.error = null;

		try {
			const [dashboardRes, metricsRes] = await Promise.all([
				fetch('/api/dashboard', { cache: 'no-store' }),
				fetch('/api/metrics', { cache: 'no-store' }).catch(() => null)
			]);

			if (!dashboardRes.ok) {
				throw new Error('Failed to load dashboard');
			}

			const dashboardParsed = dashboardResponseSchema.safeParse(await dashboardRes.json());
			if (!dashboardParsed.success) {
				throw new Error('Invalid dashboard response');
			}

			let parsedMetrics: DriverMetrics | null = null;
			if (metricsRes?.ok) {
				const metricsPayload = metricsApiResponseSchema.safeParse(await metricsRes.json());
				if (metricsPayload.success) {
					parsedMetrics = {
						...emptyDriverMetrics,
						...metricsPayload.data.metrics
					};
				}
			}

			const dashboardData = dashboardParsed.data;

			state.todayShift = dashboardData.todayShift ?? null;
			state.thisWeek = dashboardData.thisWeek ?? null;
			state.nextWeek = dashboardData.nextWeek ?? null;
			state.metrics = parsedMetrics ?? dashboardData.metrics ?? emptyDriverMetrics;
			state.pendingBids = dashboardData.pendingBids ?? [];
			state.unconfirmedShifts = dashboardData.unconfirmedShifts ?? [];
			state.isNewDriver = dashboardData.isNewDriver ?? false;
			// Increment tick to force dependent components to re-compute
			state.tick++;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.dashboard_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	async arrive(assignmentId: string) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isArriving = true;

		try {
			const res = await fetch('/api/shifts/arrive', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentId })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message ?? m.shift_arrive_error());
			}

			await this.load();

			toastStore.success(m.shift_arrive_success());
			return true;
		} catch (err) {
			const message = err instanceof Error ? err.message : m.shift_arrive_error();
			toastStore.error(message);
			return false;
		} finally {
			state.isArriving = false;
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

	async completeShift(
		assignmentId: string,
		parcelsReturned: number,
		exceptedReturns = 0,
		exceptionNotes?: string
	) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		if (state.isCompletingShift) {
			return false;
		}

		state.isCompletingShift = true;
		const mutationKey = `dashboard:completeShift:${assignmentId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const normalizeAssignment = (assignment: DashboardAssignment): DashboardAssignment => ({
			...assignment,
			shift: assignment.shift ? { ...assignment.shift } : null
		});

		const previousTodayShift =
			state.todayShift?.id === assignmentId ? normalizeAssignment(state.todayShift) : null;
		const previousThisWeekShift =
			state.thisWeek?.assignments.find((assignment) => assignment.id === assignmentId) ?? null;
		const previousNextWeekShift =
			state.nextWeek?.assignments.find((assignment) => assignment.id === assignmentId) ?? null;

		const previousThisWeekSnapshot = previousThisWeekShift
			? normalizeAssignment(previousThisWeekShift)
			: null;
		const previousNextWeekSnapshot = previousNextWeekShift
			? normalizeAssignment(previousNextWeekShift)
			: null;

		const applyAssignmentUpdate = (
			updater: (assignment: DashboardAssignment) => DashboardAssignment
		) => {
			if (state.todayShift?.id === assignmentId) {
				state.todayShift = updater(state.todayShift);
			}

			if (state.thisWeek) {
				state.thisWeek = {
					...state.thisWeek,
					assignments: state.thisWeek.assignments.map(updater)
				};
			}

			if (state.nextWeek) {
				state.nextWeek = {
					...state.nextWeek,
					assignments: state.nextWeek.assignments.map(updater)
				};
			}
		};

		const restoreSnapshot = () => {
			if (previousTodayShift) {
				state.todayShift = previousTodayShift;
			}

			if (state.thisWeek && previousThisWeekSnapshot) {
				state.thisWeek = {
					...state.thisWeek,
					assignments: state.thisWeek.assignments.map((assignment) =>
						assignment.id === assignmentId ? previousThisWeekSnapshot : assignment
					)
				};
			}

			if (state.nextWeek && previousNextWeekSnapshot) {
				state.nextWeek = {
					...state.nextWeek,
					assignments: state.nextWeek.assignments.map((assignment) =>
						assignment.id === assignmentId ? previousNextWeekSnapshot : assignment
					)
				};
			}
		};

		const normalizedExceptionNotes = exceptionNotes?.trim() ? exceptionNotes.trim() : null;

		applyAssignmentUpdate((assignment) => {
			if (assignment.id !== assignmentId) {
				return assignment;
			}

			const parcelsStart = assignment.shift?.parcelsStart ?? null;
			const optimisticCompletedAt = new Date().toISOString();
			const parcelsDelivered =
				parcelsStart === null ? null : Math.max(0, parcelsStart - parcelsReturned);

			return {
				...assignment,
				status: 'completed',
				isArrivable: false,
				isStartable: false,
				isCompletable: false,
				isCancelable: false,
				shift: {
					id: assignment.shift?.id ?? assignment.id,
					arrivedAt: assignment.shift?.arrivedAt ?? null,
					parcelsStart,
					parcelsDelivered,
					parcelsReturned,
					exceptedReturns,
					exceptionNotes: normalizedExceptionNotes,
					startedAt: assignment.shift?.startedAt ?? null,
					completedAt: optimisticCompletedAt,
					editableUntil: assignment.shift?.editableUntil ?? null
				}
			};
		});

		// Increment tick immediately after optimistic update to force UI re-render
		state.tick++;

		try {
			const res = await fetch('/api/shifts/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					assignmentId,
					parcelsReturned,
					exceptedReturns,
					exceptionNotes: normalizedExceptionNotes ?? undefined
				})
			});

			if (!res.ok) {
				throw new Error('Failed to complete shift');
			}

			const parsed = shiftCompleteResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid shift completion response');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return true;
			}

			const { shift, assignmentStatus } = parsed.data;
			applyAssignmentUpdate((assignment) => {
				if (assignment.id !== assignmentId) {
					return assignment;
				}

				return {
					...assignment,
					status: assignmentStatus,
					isArrivable: false,
					isStartable: false,
					isCompletable: false,
					isCancelable: false,
					shift: {
						id: shift.id,
						arrivedAt: assignment.shift?.arrivedAt ?? null,
						parcelsStart: shift.parcelsStart,
						parcelsDelivered: shift.parcelsDelivered,
						parcelsReturned: shift.parcelsReturned,
						exceptedReturns: shift.exceptedReturns,
						exceptionNotes: shift.exceptionNotes,
						startedAt: shift.startedAt,
						completedAt: shift.completedAt,
						editableUntil: shift.editableUntil
					}
				};
			});

			void this.load();

			toastStore.success(m.shift_complete_success());
			return true;
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return false;
			}

			restoreSnapshot();
			toastStore.error(m.shift_complete_error());
			return false;
		} finally {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.isCompletingShift = false;
			}
		}
	},

	async editShift(
		assignmentId: string,
		parcelsStart?: number,
		parcelsReturned?: number,
		exceptedReturns?: number,
		exceptionNotes?: string
	) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isEditingShift = true;

		try {
			const body: Record<string, number | string> = {};
			if (parcelsStart !== undefined) body.parcelsStart = parcelsStart;
			if (parcelsReturned !== undefined) body.parcelsReturned = parcelsReturned;
			if (exceptedReturns !== undefined) body.exceptedReturns = exceptedReturns;
			if (exceptionNotes !== undefined) body.exceptionNotes = exceptionNotes;

			const res = await fetch(`/api/shifts/${assignmentId}/edit`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.message ?? m.shift_edit_error());
			}

			await this.load();

			toastStore.success(m.shift_edit_success());
			return true;
		} catch (err) {
			const message = err instanceof Error ? err.message : m.shift_edit_error();
			toastStore.error(message);
			return false;
		} finally {
			state.isEditingShift = false;
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

			const parsed = confirmShiftResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Failed to confirm shift');
			}

			// Mark the shift as confirmed in the upcoming shifts list (don't remove it)
			state.unconfirmedShifts = state.unconfirmedShifts.map((s) =>
				s.id === assignmentId
					? { ...s, confirmedAt: parsed.data.confirmedAt, isConfirmable: false }
					: s
			);

			// Update the assignment in week summaries
			const updateAssignment = (a: DashboardAssignment) => {
				if (a.id === assignmentId) {
					return { ...a, confirmedAt: parsed.data.confirmedAt, isConfirmable: false };
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
