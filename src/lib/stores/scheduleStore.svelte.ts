/**
 * Schedule Store
 *
 * Manages driver schedule state and cancellation actions.
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

export type ScheduleAssignment = {
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

const state = $state<{
	assignments: ScheduleAssignment[];
	weekStart: string | null;
	nextWeekStart: string | null;
	hasLoaded: boolean;
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
	hasLoaded: false,
	isLoading: false,
	isCancelling: false,
	isStartingShift: false,
	isCompletingShift: false,
	isConfirming: false,
	error: null
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

const scheduleAssignmentSchema = z.object({
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

const scheduleLoadResponseSchema = z.object({
	assignments: z.array(scheduleAssignmentSchema),
	weekStart: z.string().min(1).nullable().optional(),
	nextWeekStart: z.string().min(1).nullable().optional()
});

const confirmShiftResponseSchema = z.object({
	success: z.literal(true),
	confirmedAt: z.string().min(1)
});

const cancelAssignmentResponseSchema = z.object({
	assignment: z.object({
		id: z.string().min(1),
		status: assignmentStatusSchema
	})
});

const shiftStartResponseSchema = z.object({
	shift: z.object({
		id: z.string().min(1),
		parcelsStart: z.number().int().nonnegative(),
		startedAt: z.string().min(1)
	}),
	assignmentStatus: assignmentStatusSchema
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
	get hasLoaded() {
		return state.hasLoaded;
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

			const parsed = scheduleLoadResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid schedule response');
			}

			state.assignments = parsed.data.assignments;
			state.weekStart = parsed.data.weekStart ?? null;
			state.nextWeekStart = parsed.data.nextWeekStart ?? null;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.schedule_load_error());
		} finally {
			state.isLoading = false;
			state.hasLoaded = true;
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
				throw new Error(m.shift_confirm_error());
			}

			const parsed = confirmShiftResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error(m.shift_confirm_error());
			}

			state.assignments = state.assignments.map((item) =>
				item.id === assignmentId
					? { ...item, confirmedAt: parsed.data.confirmedAt, isConfirmable: false }
					: item
			);

			toastStore.success(m.shift_confirm_success());
			return true;
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : m.shift_confirm_error());
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

			const parsed = cancelAssignmentResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid cancel response');
			}

			const { assignment } = parsed.data;
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

			const parsed = shiftStartResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid shift start response');
			}

			const { shift, assignmentStatus } = parsed.data;

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
								arrivedAt: item.shift?.arrivedAt ?? null,
								parcelsStart: shift.parcelsStart,
								parcelsDelivered: null,
								parcelsReturned: null,
								exceptedReturns: 0,
								exceptionNotes: null,
								startedAt: shift.startedAt,
								completedAt: null,
								editableUntil: null
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

	async completeShift(
		assignmentId: string,
		parcelsReturned: number,
		exceptedReturns = 0,
		exceptionNotes?: string
	) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.isCompletingShift = true;

		try {
			const res = await fetch('/api/shifts/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentId, parcelsReturned, exceptedReturns, exceptionNotes })
			});

			if (!res.ok) {
				throw new Error('Failed to complete shift');
			}

			const parsed = shiftCompleteResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid shift completion response');
			}

			const { shift, assignmentStatus } = parsed.data;

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
								arrivedAt: item.shift?.arrivedAt ?? null,
								parcelsStart: shift.parcelsStart,
								parcelsDelivered: shift.parcelsDelivered,
								parcelsReturned: shift.parcelsReturned,
								exceptedReturns: shift.exceptedReturns,
								exceptionNotes: shift.exceptionNotes,
								startedAt: shift.startedAt,
								completedAt: shift.completedAt,
								editableUntil: shift.editableUntil ?? null
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
