/**
 * Bid Window Store
 *
 * Manages bid window state with polling support for real-time updates.
 * Used by the manager dashboard to display active/resolved bid windows.
 */

import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';

export type BidWindowStatus = 'open' | 'resolved';

export type BidWindow = {
	id: string;
	assignmentId: string;
	assignmentDate: string;
	routeName: string;
	warehouseName: string;
	opensAt: string;
	closesAt: string;
	status: BidWindowStatus;
	winnerId: string | null;
	winnerName: string | null;
	bidCount: number;
};

export type BidWindowFilters = {
	status?: 'open' | 'resolved' | 'all';
	since?: string;
	warehouseId?: string;
};

const state = $state<{
	bidWindows: BidWindow[];
	isLoading: boolean;
	error: string | null;
	filters: BidWindowFilters;
	lastUpdated: string | null;
	pollingInterval: ReturnType<typeof setInterval> | null;
}>({
	bidWindows: [],
	isLoading: false,
	error: null,
	filters: {},
	lastUpdated: null,
	pollingInterval: null
});

function buildQuery(filters: BidWindowFilters) {
	const params = new URLSearchParams();
	if (filters.status) params.set('status', filters.status);
	if (filters.since) params.set('since', filters.since);
	if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
	const query = params.toString();
	return query ? `?${query}` : '';
}

export const bidWindowStore = {
	get bidWindows() {
		return state.bidWindows;
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
	get lastUpdated() {
		return state.lastUpdated;
	},
	get isPolling() {
		return state.pollingInterval !== null;
	},

	/**
	 * Derived: open bid windows only
	 */
	get openWindows() {
		return state.bidWindows.filter((w) => w.status === 'open');
	},

	/**
	 * Derived: resolved bid windows only
	 */
	get resolvedWindows() {
		return state.bidWindows.filter((w) => w.status === 'resolved');
	},

	/**
	 * Load bid windows from the API
	 */
	async load(filters?: BidWindowFilters) {
		state.isLoading = true;
		state.error = null;
		if (filters) {
			state.filters = { ...filters };
		}

		try {
			const query = buildQuery(state.filters);
			const res = await fetch(`/api/bid-windows${query}`);
			if (!res.ok) {
				throw new Error('Failed to load bid windows');
			}
			const data = await res.json();
			state.bidWindows = data.bidWindows;
			state.lastUpdated = data.lastUpdated;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.bid_windows_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	/**
	 * Start polling for bid window updates
	 * @param intervalMs - Polling interval in milliseconds (default: 30000)
	 */
	startPolling(intervalMs = 30000) {
		// Don't start if already polling
		if (state.pollingInterval) {
			return;
		}

		// Initial load
		this.load();

		// Set up interval
		state.pollingInterval = setInterval(() => {
			this.load();
		}, intervalMs);
	},

	/**
	 * Stop polling for bid window updates
	 */
	stopPolling() {
		if (state.pollingInterval) {
			clearInterval(state.pollingInterval);
			state.pollingInterval = null;
		}
	},

	/**
	 * Clear store state
	 */
	clear() {
		this.stopPolling();
		state.bidWindows = [];
		state.isLoading = false;
		state.error = null;
		state.filters = {};
		state.lastUpdated = null;
	}
};
