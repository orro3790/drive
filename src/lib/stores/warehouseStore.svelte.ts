/**
 * Warehouse Store
 *
 * Manages warehouse state with optimistic UI updates.
 * All API calls are owned by this store.
 */

import type { Warehouse, WarehouseCreate, WarehouseUpdate } from '$lib/schemas/warehouse';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';

export type WarehouseWithRouteCount = Warehouse & { routeCount: number };

const state = $state<{
	warehouses: WarehouseWithRouteCount[];
	isLoading: boolean;
	error: string | null;
}>({
	warehouses: [],
	isLoading: false,
	error: null
});

export const warehouseStore = {
	get warehouses() {
		return state.warehouses;
	},
	get isLoading() {
		return state.isLoading;
	},
	get error() {
		return state.error;
	},

	/**
	 * Load all warehouses from the API
	 */
	async load() {
		state.isLoading = true;
		state.error = null;

		try {
			const res = await fetch('/api/warehouses');
			if (!res.ok) {
				throw new Error('Failed to load warehouses');
			}
			const data = await res.json();
			state.warehouses = data.warehouses;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.warehouse_create_error());
		} finally {
			state.isLoading = false;
		}
	},

	/**
	 * Create a new warehouse (optimistic)
	 */
	create(data: WarehouseCreate) {
		const tempId = `optimistic-${crypto.randomUUID()}`;
		const now = new Date();

		// Optimistic insert
		const optimisticWarehouse: WarehouseWithRouteCount = {
			id: tempId,
			name: data.name,
			address: data.address,
			createdBy: null,
			createdAt: now,
			updatedAt: now,
			routeCount: 0
		};

		state.warehouses = [...state.warehouses, optimisticWarehouse];

		// Background API call
		this._createInDb(data, tempId);
	},

	async _createInDb(data: WarehouseCreate, tempId: string) {
		try {
			const res = await fetch('/api/warehouses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				throw new Error('Failed to create warehouse');
			}

			const { warehouse } = await res.json();

			// Replace optimistic with real data
			state.warehouses = state.warehouses.map((w) => (w.id === tempId ? warehouse : w));
			toastStore.success(m.warehouse_created_success());
		} catch (err) {
			// Revert on failure
			state.warehouses = state.warehouses.filter((w) => w.id !== tempId);
			toastStore.error(m.warehouse_create_error());
		}
	},

	/**
	 * Update a warehouse (optimistic)
	 */
	update(id: string, data: WarehouseUpdate) {
		const original = state.warehouses.find((w) => w.id === id);
		if (!original) return;

		// Optimistic update
		state.warehouses = state.warehouses.map((w) =>
			w.id === id ? { ...w, ...data, updatedAt: new Date() } : w
		);

		// Background API call
		this._updateInDb(id, data, original);
	},

	async _updateInDb(id: string, data: WarehouseUpdate, original: WarehouseWithRouteCount) {
		try {
			const res = await fetch(`/api/warehouses/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				throw new Error('Failed to update warehouse');
			}

			const { warehouse } = await res.json();

			// Replace with confirmed data
			state.warehouses = state.warehouses.map((w) => (w.id === id ? warehouse : w));
			toastStore.success(m.warehouse_updated_success());
		} catch (err) {
			// Revert on failure
			state.warehouses = state.warehouses.map((w) => (w.id === id ? original : w));
			toastStore.error(m.warehouse_update_error());
		}
	},

	/**
	 * Delete a warehouse (optimistic)
	 */
	delete(id: string) {
		const original = state.warehouses.find((w) => w.id === id);
		if (!original) return;

		// Check for routes
		if (original.routeCount > 0) {
			toastStore.error(m.warehouse_delete_has_routes());
			return;
		}

		// Optimistic delete
		state.warehouses = state.warehouses.filter((w) => w.id !== id);

		// Background API call
		this._deleteInDb(id, original);
	},

	async _deleteInDb(id: string, original: WarehouseWithRouteCount) {
		try {
			const res = await fetch(`/api/warehouses/${id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				if (res.status === 400 && data.message?.includes('attached routes')) {
					throw new Error('has_routes');
				}
				throw new Error('Failed to delete warehouse');
			}

			toastStore.success(m.warehouse_deleted_success());
		} catch (err) {
			// Revert on failure
			state.warehouses = [...state.warehouses, original];
			if (err instanceof Error && err.message === 'has_routes') {
				toastStore.error(m.warehouse_delete_has_routes());
			} else {
				toastStore.error(m.warehouse_delete_error());
			}
		}
	}
};
