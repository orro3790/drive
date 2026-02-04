/**
 * Driver Store
 *
 * Manages driver state for manager dashboard with optimistic UI updates.
 * All API calls are owned by this store.
 */

import type { Driver, DriverUpdate } from '$lib/schemas/driver';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';

const state = $state<{
	drivers: Driver[];
	isLoading: boolean;
	error: string | null;
}>({
	drivers: [],
	isLoading: false,
	error: null
});

export const driverStore = {
	get drivers() {
		return state.drivers;
	},
	get isLoading() {
		return state.isLoading;
	},
	get error() {
		return state.error;
	},

	/**
	 * Load all drivers from the API
	 */
	async load() {
		state.isLoading = true;
		state.error = null;

		try {
			const res = await fetch('/api/drivers');
			if (!res.ok) {
				throw new Error('Failed to load drivers');
			}
			const data = await res.json();
			state.drivers = data.drivers;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.drivers_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	/**
	 * Update a driver's weekly cap (optimistic)
	 */
	updateCap(id: string, weeklyCap: number) {
		const original = state.drivers.find((d) => d.id === id);
		if (!original) return;

		// Optimistic update
		state.drivers = state.drivers.map((d) => (d.id === id ? { ...d, weeklyCap } : d));

		this._updateInDb(id, { weeklyCap }, original);
	},

	/**
	 * Unflag a driver (optimistic)
	 */
	unflag(id: string) {
		const original = state.drivers.find((d) => d.id === id);
		if (!original) return;

		// Optimistic update
		state.drivers = state.drivers.map((d) =>
			d.id === id ? { ...d, isFlagged: false, flagWarningDate: null } : d
		);

		this._unflagInDb(id, original);
	},

	async _updateInDb(id: string, data: DriverUpdate, original: Driver) {
		try {
			const res = await fetch(`/api/drivers/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				throw new Error('Failed to update driver');
			}

			const { driver } = await res.json();
			state.drivers = state.drivers.map((d) => (d.id === id ? driver : d));
			toastStore.success(m.drivers_updated_success());
		} catch {
			// Rollback
			state.drivers = state.drivers.map((d) => (d.id === id ? original : d));
			toastStore.error(m.drivers_update_error());
		}
	},

	async _unflagInDb(id: string, original: Driver) {
		try {
			const res = await fetch(`/api/drivers/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ unflag: true })
			});

			if (!res.ok) {
				throw new Error('Failed to unflag driver');
			}

			const { driver } = await res.json();
			state.drivers = state.drivers.map((d) => (d.id === id ? driver : d));
			toastStore.success(m.drivers_unflagged_success());
		} catch {
			// Rollback
			state.drivers = state.drivers.map((d) => (d.id === id ? original : d));
			toastStore.error(m.drivers_unflag_error());
		}
	}
};
