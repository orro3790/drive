/**
 * Warehouse Store
 *
 * Manages warehouse state with optimistic UI updates.
 * All API calls are owned by this store.
 */

import type { Warehouse, WarehouseCreate, WarehouseUpdate } from '$lib/schemas/warehouse';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import { z } from 'zod';

export type WarehouseWithRouteCount = Warehouse & {
	routeCount: number;
	assignedDriversNext7: number;
	assignedDriversDelta7: number;
	unfilledRoutesNext7: number;
	unfilledRoutesDelta7: number;
	openBidWindows: number;
	managerCount: number;
};

const state = $state<{
	warehouses: WarehouseWithRouteCount[];
	isLoading: boolean;
	error: string | null;
}>({
	warehouses: [],
	isLoading: false,
	error: null
});

const warehouseWithRouteCountSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	address: z.string().min(1),
	createdBy: z.string().min(1).nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	routeCount: z.number().int().nonnegative(),
	assignedDriversNext7: z.number().int(),
	assignedDriversDelta7: z.number().int(),
	unfilledRoutesNext7: z.number().int(),
	unfilledRoutesDelta7: z.number().int(),
	openBidWindows: z.number().int().nonnegative(),
	managerCount: z.number().int().nonnegative()
});

const warehouseListResponseSchema = z.object({
	warehouses: z.array(warehouseWithRouteCountSchema)
});

const warehouseMutationResponseSchema = z.object({
	warehouse: warehouseWithRouteCountSchema
});

const mutationVersions = new Map<string, number>();

function nextMutationVersion(mutationKey: string): number {
	const version = (mutationVersions.get(mutationKey) ?? 0) + 1;
	mutationVersions.set(mutationKey, version);
	return version;
}

function isLatestMutationVersion(mutationKey: string, version: number): boolean {
	return (mutationVersions.get(mutationKey) ?? 0) === version;
}

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
			const parsed = warehouseListResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid warehouses response');
			}
			state.warehouses = parsed.data.warehouses;
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
		if (!ensureOnlineForWrite()) {
			return;
		}

		const tempId = `optimistic-${crypto.randomUUID()}`;
		const now = new Date();
		const mutationKey = `create:${tempId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		// Optimistic insert
		const optimisticWarehouse: WarehouseWithRouteCount = {
			id: tempId,
			name: data.name,
			address: data.address,
			createdBy: null,
			createdAt: now,
			updatedAt: now,
			routeCount: 0,
			assignedDriversNext7: 0,
			assignedDriversDelta7: 0,
			unfilledRoutesNext7: 0,
			unfilledRoutesDelta7: 0,
			openBidWindows: 0,
			managerCount: 0
		};

		state.warehouses = [...state.warehouses, optimisticWarehouse];

		// Background API call
		this._createInDb(data, tempId, mutationKey, mutationVersion);
	},

	async _createInDb(
		data: WarehouseCreate,
		tempId: string,
		mutationKey: string,
		mutationVersion: number
	) {
		try {
			const res = await fetch('/api/warehouses', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				throw new Error('Failed to create warehouse');
			}

			const parsed = warehouseMutationResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Failed to create warehouse');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			const { warehouse } = parsed.data;

			// Replace optimistic with real data
			state.warehouses = state.warehouses.map((w) => (w.id === tempId ? warehouse : w));
			toastStore.success(m.warehouse_created_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			// Revert on failure
			state.warehouses = state.warehouses.filter((w) => w.id !== tempId);
			toastStore.error(m.warehouse_create_error());
		}
	},

	/**
	 * Update a warehouse (optimistic)
	 */
	update(id: string, data: WarehouseUpdate) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.warehouses.find((w) => w.id === id);
		if (!original) return;
		const mutationKey = `update:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		// Optimistic update
		state.warehouses = state.warehouses.map((w) =>
			w.id === id ? { ...w, ...data, updatedAt: new Date() } : w
		);

		// Background API call
		this._updateInDb(id, data, original, mutationKey, mutationVersion);
	},

	async _updateInDb(
		id: string,
		data: WarehouseUpdate,
		original: WarehouseWithRouteCount,
		mutationKey: string,
		mutationVersion: number
	) {
		try {
			const res = await fetch(`/api/warehouses/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				throw new Error('Failed to update warehouse');
			}

			const parsed = warehouseMutationResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Failed to update warehouse');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			const { warehouse } = parsed.data;

			// Replace with confirmed data
			state.warehouses = state.warehouses.map((w) => (w.id === id ? warehouse : w));
			toastStore.success(m.warehouse_updated_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			// Revert on failure
			state.warehouses = state.warehouses.map((w) => (w.id === id ? original : w));
			toastStore.error(m.warehouse_update_error());
		}
	},

	/**
	 * Delete a warehouse (optimistic)
	 */
	delete(id: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.warehouses.find((w) => w.id === id);
		if (!original) return;
		const mutationKey = `delete:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		// Check for routes
		if (original.routeCount > 0) {
			toastStore.error(m.warehouse_delete_has_routes());
			return;
		}

		// Optimistic delete
		state.warehouses = state.warehouses.filter((w) => w.id !== id);

		// Background API call
		this._deleteInDb(id, original, mutationKey, mutationVersion);
	},

	async _deleteInDb(
		id: string,
		original: WarehouseWithRouteCount,
		mutationKey: string,
		mutationVersion: number
	) {
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

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			toastStore.success(m.warehouse_deleted_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

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
