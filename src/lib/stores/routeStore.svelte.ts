/**
 * Route Store
 *
 * Manages route state with optimistic UI updates.
 * All API calls are owned by this store.
 */

import type { Route, RouteCreate, RouteStatus, RouteUpdate } from '$lib/schemas/route';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';

export type RouteWithWarehouse = Route & {
	warehouseName: string;
	status: RouteStatus;
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
}>({
	routes: [],
	isLoading: false,
	error: null,
	filters: {}
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
			const data = await res.json();
			state.routes = data.routes;
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
		const tempId = `optimistic-${crypto.randomUUID()}`;
		const now = new Date();

		const optimisticRoute: RouteWithWarehouse = {
			id: tempId,
			name: data.name,
			warehouseId: data.warehouseId,
			warehouseName,
			createdBy: null,
			createdAt: now,
			updatedAt: now,
			status: 'unfilled',
			assignmentId: null,
			driverName: null,
			bidWindowClosesAt: null
		};

		if (matchesFilters(optimisticRoute, state.filters)) {
			state.routes = [...state.routes, optimisticRoute];
		}

		this._createInDb(data, tempId);
	},

	async _createInDb(data: RouteCreate, tempId: string) {
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

			const { route } = await res.json();

			const exists = state.routes.some((item) => item.id === tempId);
			if (exists) {
				state.routes = state.routes.map((item) => (item.id === tempId ? route : item));
			} else if (matchesFilters(route, state.filters)) {
				state.routes = [...state.routes, route];
			}
			toastStore.success(m.route_created_success());
		} catch (err) {
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
		const original = state.routes.find((route) => route.id === id);
		if (!original) return;

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

		this._updateInDb(id, data, original);
	},

	async _updateInDb(id: string, data: RouteUpdate, original: RouteWithWarehouse) {
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

			const { route } = await res.json();
			if (matchesFilters(route, state.filters)) {
				state.routes = state.routes.map((item) => (item.id === id ? route : item));
			} else {
				state.routes = state.routes.filter((item) => item.id !== id);
			}
			toastStore.success(m.route_updated_success());
		} catch (err) {
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
		const original = state.routes.find((route) => route.id === id);
		if (!original) return;

		state.routes = state.routes.filter((route) => route.id !== id);
		this._deleteInDb(id, original);
	},

	async _deleteInDb(id: string, original: RouteWithWarehouse) {
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

			toastStore.success(m.route_deleted_success());
		} catch (err) {
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
	}
};
