/**
 * Bid Window Store
 *
 * Manages bid window state with polling support for real-time updates.
 * Used by the manager dashboard to display active/resolved bid windows.
 */

import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';
import { routeStore, type RouteWithWarehouse } from '$lib/stores/routeStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import { z } from 'zod';

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
	assigningWindowId: string | null;
	closingWindowId: string | null;
}>({
	bidWindows: [],
	isLoading: false,
	error: null,
	filters: {},
	lastUpdated: null,
	pollingInterval: null,
	assigningWindowId: null,
	closingWindowId: null
});

function buildQuery(filters: BidWindowFilters) {
	const params = new URLSearchParams();
	if (filters.status) params.set('status', filters.status);
	if (filters.since) params.set('since', filters.since);
	if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
	const query = params.toString();
	return query ? `?${query}` : '';
}

const bidWindowSchema = z.object({
	id: z.string().min(1),
	assignmentId: z.string().min(1),
	assignmentDate: z.string().min(1),
	routeName: z.string().min(1),
	warehouseName: z.string().min(1),
	opensAt: z.string().min(1),
	closesAt: z.string().min(1),
	status: z.enum(['open', 'resolved']),
	winnerId: z.string().min(1).nullable(),
	winnerName: z.string().nullable(),
	bidCount: z.number().int().nonnegative()
});

const bidWindowListResponseSchema = z.object({
	bidWindows: z.array(bidWindowSchema),
	lastUpdated: z.string().min(1).nullable().optional()
});

const bidWindowMutationResponseSchema = z.object({
	bidWindow: bidWindowSchema
});

const loadRequestVersions = { current: 0 };
const mutationVersions = new Map<string, number>();

function nextLoadRequestVersion(): number {
	loadRequestVersions.current += 1;
	return loadRequestVersions.current;
}

function isLatestLoadRequestVersion(version: number): boolean {
	return loadRequestVersions.current === version;
}

function nextMutationVersion(mutationKey: string): number {
	const version = (mutationVersions.get(mutationKey) ?? 0) + 1;
	mutationVersions.set(mutationKey, version);
	return version;
}

function isLatestMutationVersion(mutationKey: string, version: number): boolean {
	return (mutationVersions.get(mutationKey) ?? 0) === version;
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
	get assigningWindowId() {
		return state.assigningWindowId;
	},
	get closingWindowId() {
		return state.closingWindowId;
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

	isAssigning(windowId: string) {
		return state.assigningWindowId === windowId;
	},

	isClosing(windowId: string) {
		return state.closingWindowId === windowId;
	},

	/**
	 * Load bid windows from the API
	 */
	async load(filters?: BidWindowFilters) {
		const requestVersion = nextLoadRequestVersion();
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
			const parsed = bidWindowListResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid bid windows response');
			}

			if (!isLatestLoadRequestVersion(requestVersion)) {
				return;
			}

			state.bidWindows = parsed.data.bidWindows;
			state.lastUpdated = parsed.data.lastUpdated ?? null;
		} catch (err) {
			if (!isLatestLoadRequestVersion(requestVersion)) {
				return;
			}

			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.bid_windows_load_error());
		} finally {
			if (isLatestLoadRequestVersion(requestVersion)) {
				state.isLoading = false;
			}
		}
	},

	manualAssign(window: BidWindow, driver: { id: string; name: string }) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.bidWindows.find((w) => w.id === window.id);
		if (!original) return;
		const mutationKey = `assign:${window.id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const optimisticWindow: BidWindow = {
			...original,
			status: 'resolved',
			winnerId: driver.id,
			winnerName: driver.name
		};

		state.bidWindows = state.bidWindows.map((w) => (w.id === window.id ? optimisticWindow : w));

		const originalRoute = routeStore.applyAssignmentUpdate(window.assignmentId, {
			status: 'assigned',
			driverName: driver.name,
			bidWindowClosesAt: null
		});

		this._assignInDb(window, driver, original, originalRoute, mutationKey, mutationVersion);
	},

	async _assignInDb(
		window: BidWindow,
		driver: { id: string; name: string },
		original: BidWindow,
		originalRoute: RouteWithWarehouse | null,
		mutationKey: string,
		mutationVersion: number
	) {
		state.assigningWindowId = window.id;
		try {
			const res = await fetch(`/api/bid-windows/${window.id}/assign`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ driverId: driver.id })
			});

			if (!res.ok) {
				throw new Error('Failed to assign driver');
			}

			const parsed = bidWindowMutationResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid bid window response');
			}

			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.bidWindows = state.bidWindows.map((w) =>
					w.id === window.id ? parsed.data.bidWindow : w
				);
				routeStore.applyAssignmentUpdate(window.assignmentId, {
					status: parsed.data.bidWindow.winnerName ? 'assigned' : 'unfilled',
					driverName: parsed.data.bidWindow.winnerName ?? null,
					bidWindowClosesAt: null
				});
				toastStore.success(m.bid_windows_assign_success());
			}
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.bidWindows = state.bidWindows.map((w) => (w.id === window.id ? original : w));
				routeStore.rollbackAssignmentUpdate(originalRoute);
				toastStore.error(m.bid_windows_assign_error());
			}
		} finally {
			if (
				state.assigningWindowId === window.id &&
				isLatestMutationVersion(mutationKey, mutationVersion)
			) {
				state.assigningWindowId = null;
			}
		}
	},

	closeWindow(window: BidWindow) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.bidWindows.find((w) => w.id === window.id);
		if (!original) return;
		const mutationKey = `close:${window.id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const optimisticWindow: BidWindow = {
			...original,
			status: 'resolved',
			winnerId: null,
			winnerName: null
		};

		state.bidWindows = state.bidWindows.map((w) => (w.id === window.id ? optimisticWindow : w));

		const originalRoute = routeStore.applyAssignmentUpdate(window.assignmentId, {
			status: 'unfilled',
			driverName: null,
			bidWindowClosesAt: null
		});

		this._closeInDb(window, original, originalRoute, mutationKey, mutationVersion);
	},

	async _closeInDb(
		window: BidWindow,
		original: BidWindow,
		originalRoute: RouteWithWarehouse | null,
		mutationKey: string,
		mutationVersion: number
	) {
		state.closingWindowId = window.id;
		try {
			const res = await fetch(`/api/bid-windows/${window.id}/close`, {
				method: 'POST'
			});

			if (!res.ok) {
				throw new Error('Failed to close bid window');
			}

			const parsed = bidWindowMutationResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid bid window response');
			}

			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.bidWindows = state.bidWindows.map((w) =>
					w.id === window.id ? parsed.data.bidWindow : w
				);
				routeStore.applyAssignmentUpdate(window.assignmentId, {
					status: parsed.data.bidWindow.winnerName ? 'assigned' : 'unfilled',
					driverName: parsed.data.bidWindow.winnerName ?? null,
					bidWindowClosesAt: null
				});
				toastStore.success(m.bid_windows_close_success());
			}
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.bidWindows = state.bidWindows.map((w) => (w.id === window.id ? original : w));
				routeStore.rollbackAssignmentUpdate(originalRoute);
				toastStore.error(m.bid_windows_close_error());
			}
		} finally {
			if (
				state.closingWindowId === window.id &&
				isLatestMutationVersion(mutationKey, mutationVersion)
			) {
				state.closingWindowId = null;
			}
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
		state.assigningWindowId = null;
		state.closingWindowId = null;
	}
};
