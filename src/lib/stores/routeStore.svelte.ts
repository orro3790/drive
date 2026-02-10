/**
 * Route Store
 *
 * Manages route state with optimistic UI updates.
 * All API calls are owned by this store.
 */

import {
	routeStatusSchema,
	type RouteCreate,
	type RouteStatus,
	type RouteUpdate
} from '$lib/schemas/route';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import { z } from 'zod';

export type RouteWithWarehouse = {
	id: string;
	name: string;
	startTime: string;
	warehouseId: string;
	warehouseName: string;
	managerId?: string | null;
	createdBy?: string | null;
	createdAt: Date;
	updatedAt: Date;
	status: RouteStatus;
	assignmentStatus: 'scheduled' | 'active' | 'completed' | 'cancelled' | 'unfilled' | null;
	isShiftStarted: boolean;
	assignmentId: string | null;
	driverName: string | null;
	bidWindowClosesAt: string | null;
};

export type RouteFilters = {
	warehouseId?: string;
	status?: RouteStatus;
	date?: string;
};

const state = $state<{
	routes: RouteWithWarehouse[];
	isLoading: boolean;
	error: string | null;
	filters: RouteFilters;
	assigningAssignmentId: string | null;
	overridingAssignmentId: string | null;
}>({
	routes: [],
	isLoading: false,
	error: null,
	filters: {},
	assigningAssignmentId: null,
	overridingAssignmentId: null
});

function matchesFilters(route: RouteWithWarehouse, filters: RouteFilters) {
	if (filters.warehouseId && route.warehouseId !== filters.warehouseId) return false;
	if (filters.status && route.status !== filters.status) return false;
	return true;
}

function buildQuery(filters: RouteFilters) {
	const params = new URLSearchParams();
	if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
	if (filters.status) params.set('status', filters.status);
	if (filters.date) params.set('date', filters.date);
	const query = params.toString();
	return query ? `?${query}` : '';
}

const routeWithWarehouseSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	startTime: z.string().min(1),
	warehouseId: z.string().min(1),
	warehouseName: z.string().min(1),
	managerId: z.string().min(1).nullable().optional(),
	createdBy: z.string().min(1).nullable().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	status: routeStatusSchema,
	assignmentStatus: z
		.enum(['scheduled', 'active', 'completed', 'cancelled', 'unfilled'])
		.nullable(),
	isShiftStarted: z.boolean(),
	assignmentId: z.string().min(1).nullable(),
	driverName: z.string().nullable(),
	bidWindowClosesAt: z.string().min(1).nullable()
});

const routeListResponseSchema = z.object({
	routes: z.array(routeWithWarehouseSchema)
});

const routeMutationResponseSchema = z.object({
	route: routeWithWarehouseSchema
});

const assignmentStatusSchema = z.enum([
	'scheduled',
	'active',
	'completed',
	'cancelled',
	'unfilled'
]);

const overrideActionSchema = z.enum(['reassign', 'open_bidding', 'open_urgent_bidding']);

const assignmentOverrideResponseSchema = z.object({
	action: overrideActionSchema,
	assignment: z
		.object({
			id: z.string().min(1),
			status: assignmentStatusSchema,
			userId: z.string().nullable(),
			driverName: z.string().nullable(),
			routeId: z.string().min(1)
		})
		.strict(),
	bidWindow: z
		.object({
			id: z.string().min(1),
			mode: z.enum(['competitive', 'instant', 'emergency']),
			status: z.enum(['open', 'closed', 'resolved']),
			closesAt: z.string().min(1),
			payBonusPercent: z.number().int()
		})
		.nullable(),
	notifiedCount: z.number().int().nullable()
});

function resolveRouteStatusFromAssignment(params: {
	assignmentStatus: z.infer<typeof assignmentStatusSchema>;
	bidWindowStatus: 'open' | 'closed' | 'resolved' | null;
}): RouteStatus {
	if (params.assignmentStatus === 'unfilled') {
		return params.bidWindowStatus === 'open' ? 'bidding' : 'unfilled';
	}

	return 'assigned';
}

const mutationVersions = new Map<string, number>();

function nextMutationVersion(mutationKey: string): number {
	const version = (mutationVersions.get(mutationKey) ?? 0) + 1;
	mutationVersions.set(mutationKey, version);
	return version;
}

function isLatestMutationVersion(mutationKey: string, version: number): boolean {
	return (mutationVersions.get(mutationKey) ?? 0) === version;
}

export const routeStore = {
	get routes() {
		return state.routes;
	},
	get isLoading() {
		return state.isLoading;
	},
	get error() {
		return state.error;
	},
	get filters() {
		return state.filters;
	},
	get assigningAssignmentId() {
		return state.assigningAssignmentId;
	},

	isAssigningAssignment(assignmentId: string) {
		return state.assigningAssignmentId === assignmentId;
	},
	get overridingAssignmentId() {
		return state.overridingAssignmentId;
	},
	isOverridingAssignment(assignmentId: string) {
		return state.overridingAssignmentId === assignmentId;
	},
	// Backward-compatible accessors while views migrate to explicit override naming.
	get emergencyReopenAssignmentId() {
		return state.overridingAssignmentId;
	},
	isEmergencyReopening(assignmentId: string) {
		return state.overridingAssignmentId === assignmentId;
	},

	/**
	 * Load all routes from the API
	 */
	async load(filters?: RouteFilters) {
		state.isLoading = true;
		state.error = null;
		state.filters = filters ? { ...filters } : state.filters;

		try {
			const query = buildQuery(state.filters);
			const res = await fetch(`/api/routes${query}`);
			if (!res.ok) {
				throw new Error('Failed to load routes');
			}
			const parsed = routeListResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid routes response');
			}
			state.routes = parsed.data.routes;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.route_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	/**
	 * Create a new route (optimistic)
	 */
	create(data: RouteCreate, warehouseName = '') {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const tempId = `optimistic-${crypto.randomUUID()}`;
		const now = new Date();
		const mutationKey = `create:${tempId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const optimisticRoute: RouteWithWarehouse = {
			id: tempId,
			name: data.name,
			startTime: data.startTime,
			warehouseId: data.warehouseId,
			warehouseName,
			createdBy: null,
			createdAt: now,
			updatedAt: now,
			status: 'unfilled',
			assignmentStatus: null,
			isShiftStarted: false,
			assignmentId: null,
			driverName: null,
			bidWindowClosesAt: null
		};

		if (matchesFilters(optimisticRoute, state.filters)) {
			state.routes = [...state.routes, optimisticRoute];
		}

		this._createInDb(data, tempId, mutationKey, mutationVersion);
	},

	async _createInDb(
		data: RouteCreate,
		tempId: string,
		mutationKey: string,
		mutationVersion: number
	) {
		try {
			const res = await fetch('/api/routes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				if (res.status === 409 && payload.message?.includes('unique')) {
					throw new Error('duplicate');
				}
				throw new Error('Failed to create route');
			}

			const parsed = routeMutationResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Failed to create route');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			const { route } = parsed.data;

			const exists = state.routes.some((item) => item.id === tempId);
			if (exists) {
				state.routes = state.routes.map((item) => (item.id === tempId ? route : item));
			} else if (matchesFilters(route, state.filters)) {
				state.routes = [...state.routes, route];
			}
			toastStore.success(m.route_created_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			state.routes = state.routes.filter((item) => item.id !== tempId);
			if (err instanceof Error && err.message === 'duplicate') {
				toastStore.error(m.route_name_unique_error());
			} else {
				toastStore.error(m.route_create_error());
			}
		}
	},

	/**
	 * Update a route (optimistic)
	 */
	update(id: string, data: RouteUpdate, warehouseName?: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.routes.find((route) => route.id === id);
		if (!original) return;
		const mutationKey = `update:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const nextRoute: RouteWithWarehouse = {
			...original,
			...data,
			warehouseName: warehouseName ?? original.warehouseName,
			updatedAt: new Date()
		};

		if (matchesFilters(nextRoute, state.filters)) {
			state.routes = state.routes.map((route) => (route.id === id ? nextRoute : route));
		} else {
			state.routes = state.routes.filter((route) => route.id !== id);
		}

		this._updateInDb(id, data, original, mutationKey, mutationVersion);
	},

	async _updateInDb(
		id: string,
		data: RouteUpdate,
		original: RouteWithWarehouse,
		mutationKey: string,
		mutationVersion: number
	) {
		try {
			const query = state.filters.date ? `?date=${encodeURIComponent(state.filters.date)}` : '';
			const res = await fetch(`/api/routes/${id}${query}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				if (res.status === 409 && payload.message?.includes('unique')) {
					throw new Error('duplicate');
				}
				throw new Error('Failed to update route');
			}

			const parsed = routeMutationResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Failed to update route');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			const { route } = parsed.data;
			if (matchesFilters(route, state.filters)) {
				state.routes = state.routes.map((item) => (item.id === id ? route : item));
			} else {
				state.routes = state.routes.filter((item) => item.id !== id);
			}
			toastStore.success(m.route_updated_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			if (matchesFilters(original, state.filters)) {
				const exists = state.routes.some((route) => route.id === original.id);
				state.routes = exists
					? state.routes.map((route) => (route.id === original.id ? original : route))
					: [...state.routes, original];
			}
			if (err instanceof Error && err.message === 'duplicate') {
				toastStore.error(m.route_name_unique_error());
			} else {
				toastStore.error(m.route_update_error());
			}
		}
	},

	/**
	 * Delete a route (optimistic)
	 */
	delete(id: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.routes.find((route) => route.id === id);
		if (!original) return;
		const mutationKey = `delete:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		state.routes = state.routes.filter((route) => route.id !== id);
		this._deleteInDb(id, original, mutationKey, mutationVersion);
	},

	async _deleteInDb(
		id: string,
		original: RouteWithWarehouse,
		mutationKey: string,
		mutationVersion: number
	) {
		try {
			const res = await fetch(`/api/routes/${id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				if (res.status === 400 && payload.message?.includes('future assignments')) {
					throw new Error('future_assignments');
				}
				throw new Error('Failed to delete route');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			toastStore.success(m.route_deleted_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			state.routes = [...state.routes, original];
			if (err instanceof Error && err.message === 'future_assignments') {
				toastStore.error(m.route_delete_has_assignments());
			} else {
				toastStore.error(m.route_delete_error());
			}
		}
	},

	/**
	 * Apply assignment updates for a route (optimistic)
	 */
	applyAssignmentUpdate(assignmentId: string, updates: Partial<RouteWithWarehouse>) {
		const original = state.routes.find((route) => route.assignmentId === assignmentId);
		if (!original) return null;

		const nextRoute: RouteWithWarehouse = {
			...original,
			...updates
		};

		if (matchesFilters(nextRoute, state.filters)) {
			state.routes = state.routes.map((route) => (route.id === original.id ? nextRoute : route));
		} else {
			state.routes = state.routes.filter((route) => route.id !== original.id);
		}

		return original;
	},

	manualAssign(assignmentId: string, driver: { id: string; name: string }) {
		if (!ensureOnlineForWrite()) {
			return Promise.resolve({ ok: false, message: m.offline_requires_connectivity() });
		}

		const originalRoute = this.applyAssignmentUpdate(assignmentId, {
			status: 'assigned',
			assignmentStatus: 'scheduled',
			driverName: driver.name,
			bidWindowClosesAt: null
		});

		if (!originalRoute) {
			return Promise.resolve({ ok: false, message: m.manager_dashboard_detail_no_assignment() });
		}

		const mutationKey = `assign:${assignmentId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		return this._assignInDb(assignmentId, driver, originalRoute, mutationKey, mutationVersion);
	},

	async _assignInDb(
		assignmentId: string,
		driver: { id: string; name: string },
		originalRoute: RouteWithWarehouse,
		mutationKey: string,
		mutationVersion: number
	) {
		state.assigningAssignmentId = assignmentId;
		try {
			const res = await fetch(`/api/assignments/${assignmentId}/override`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'reassign',
					driverId: driver.id
				})
			});

			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				const message = typeof payload?.message === 'string' ? payload.message : null;

				if (isLatestMutationVersion(mutationKey, mutationVersion)) {
					this.rollbackAssignmentUpdate(originalRoute);
				}

				if (!message && isLatestMutationVersion(mutationKey, mutationVersion)) {
					toastStore.error(m.bid_windows_assign_error());
				}

				return { ok: false, message: message ?? undefined };
			}

			const parsed = assignmentOverrideResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid assignment override response');
			}

			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				this.applyAssignmentUpdate(assignmentId, {
					status: resolveRouteStatusFromAssignment({
						assignmentStatus: parsed.data.assignment.status,
						bidWindowStatus: parsed.data.bidWindow?.status ?? null
					}),
					assignmentStatus: parsed.data.assignment.status,
					driverName: parsed.data.assignment.driverName ?? driver.name,
					bidWindowClosesAt:
						parsed.data.bidWindow?.status === 'open' ? parsed.data.bidWindow.closesAt : null
				});
			}

			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				toastStore.success(m.bid_windows_assign_success());
			}
			return { ok: true };
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				this.rollbackAssignmentUpdate(originalRoute);
				toastStore.error(m.bid_windows_assign_error());
			}
			return { ok: false };
		} finally {
			if (
				state.assigningAssignmentId === assignmentId &&
				isLatestMutationVersion(mutationKey, mutationVersion)
			) {
				state.assigningAssignmentId = null;
			}
		}
	},

	openBidding(assignmentId: string): Promise<{ ok: boolean; notifiedCount?: number }> {
		if (!ensureOnlineForWrite()) {
			return Promise.resolve({ ok: false });
		}

		const originalRoute = this.applyAssignmentUpdate(assignmentId, {
			status: 'bidding',
			assignmentStatus: 'unfilled',
			driverName: null
		});

		if (!originalRoute) {
			return Promise.resolve({ ok: false });
		}

		const mutationKey = `openBidding:${assignmentId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		return this._runOverrideActionInDb(
			assignmentId,
			'open_bidding',
			originalRoute,
			mutationKey,
			mutationVersion,
			() => m.manager_override_open_bidding_success(),
			() => m.manager_override_open_bidding_error()
		);
	},

	openUrgentBidding(assignmentId: string): Promise<{ ok: boolean; notifiedCount?: number }> {
		if (!ensureOnlineForWrite()) {
			return Promise.resolve({ ok: false });
		}

		const originalRoute = this.applyAssignmentUpdate(assignmentId, {
			status: 'bidding',
			assignmentStatus: 'unfilled',
			driverName: null
		});

		if (!originalRoute) {
			return Promise.resolve({ ok: false });
		}

		const mutationKey = `openUrgentBidding:${assignmentId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		return this._runOverrideActionInDb(
			assignmentId,
			'open_urgent_bidding',
			originalRoute,
			mutationKey,
			mutationVersion,
			(result) =>
				m.manager_override_open_urgent_bidding_success({ count: result.notifiedCount ?? 0 }),
			() => m.manager_override_open_urgent_bidding_error()
		);
	},

	async _runOverrideActionInDb(
		assignmentId: string,
		action: z.infer<typeof overrideActionSchema>,
		originalRoute: RouteWithWarehouse,
		mutationKey: string,
		mutationVersion: number,
		successMessage: (result: z.infer<typeof assignmentOverrideResponseSchema>) => string,
		errorMessage: () => string
	): Promise<{ ok: boolean; notifiedCount?: number }> {
		state.overridingAssignmentId = assignmentId;

		try {
			const res = await fetch(`/api/assignments/${assignmentId}/override`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});

			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				const message = typeof payload?.message === 'string' ? payload.message : null;

				if (isLatestMutationVersion(mutationKey, mutationVersion)) {
					this.rollbackAssignmentUpdate(originalRoute);
					toastStore.error(message ?? errorMessage());
				}

				return { ok: false };
			}

			const parsed = assignmentOverrideResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid assignment override response');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return {
					ok: true,
					notifiedCount: parsed.data.notifiedCount ?? undefined
				};
			}

			this.applyAssignmentUpdate(assignmentId, {
				status: resolveRouteStatusFromAssignment({
					assignmentStatus: parsed.data.assignment.status,
					bidWindowStatus: parsed.data.bidWindow?.status ?? null
				}),
				assignmentStatus: parsed.data.assignment.status,
				driverName: parsed.data.assignment.driverName,
				bidWindowClosesAt:
					parsed.data.bidWindow?.status === 'open' ? parsed.data.bidWindow.closesAt : null
			});

			toastStore.success(successMessage(parsed.data));
			return {
				ok: true,
				notifiedCount: parsed.data.notifiedCount ?? undefined
			};
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				this.rollbackAssignmentUpdate(originalRoute);
				toastStore.error(errorMessage());
			}
			return { ok: false };
		} finally {
			if (
				state.overridingAssignmentId === assignmentId &&
				isLatestMutationVersion(mutationKey, mutationVersion)
			) {
				state.overridingAssignmentId = null;
			}
		}
	},

	rollbackAssignmentUpdate(original: RouteWithWarehouse | null) {
		if (!original) return;
		if (matchesFilters(original, state.filters)) {
			const exists = state.routes.some((route) => route.id === original.id);
			state.routes = exists
				? state.routes.map((route) => (route.id === original.id ? original : route))
				: [...state.routes, original];
		} else {
			state.routes = state.routes.filter((route) => route.id !== original.id);
		}
	},

	async emergencyReopen(assignmentId: string): Promise<{ ok: boolean; notifiedCount?: number }> {
		return this.openUrgentBidding(assignmentId);
	}
};
