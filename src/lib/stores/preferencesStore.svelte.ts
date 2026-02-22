/**
 * Driver Preferences Store
 *
 * Manages driver preferences state with optimistic UI updates.
 * Handles preferred days and routes selection.
 *
 * Preferences are always editable — the scheduling algorithm takes a
 * snapshot of whatever is selected at the weekly lock deadline.
 */

import { preferencesResponseSchema, type PreferencesUpdate } from '$lib/schemas/preferences';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';

export type RouteDetail = {
	id: string;
	name: string;
	warehouseName: string;
};

export type PreferencesData = {
	id: string;
	userId: string;
	preferredDays: number[];
	preferredRoutes: string[];
	preferredRoutesDetails: RouteDetail[];
	updatedAt: Date;
	lockedAt: Date | null;
};

const state = $state<{
	preferences: PreferencesData | null;
	dayCounts: Record<string, number>;
	weeklyCap: number;
	isLoading: boolean;
	isSaving: boolean;
	error: string | null;
}>({
	preferences: null,
	dayCounts: {},
	weeklyCap: 4,
	isLoading: false,
	isSaving: false,
	error: null
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

export const preferencesStore = {
	get preferences() {
		return state.preferences;
	},
	get dayCounts() {
		return state.dayCounts;
	},
	get weeklyCap() {
		return state.weeklyCap;
	},
	get isLoading() {
		return state.isLoading;
	},
	get isSaving() {
		return state.isSaving;
	},
	get error() {
		return state.error;
	},

	/**
	 * Load preferences from API
	 */
	async load() {
		state.isLoading = true;
		state.error = null;

		try {
			const res = await fetch('/api/preferences');
			if (!res.ok) {
				throw new Error('Failed to load preferences');
			}

			const parsed = preferencesResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid preferences response');
			}

			state.preferences = parsed.data.preferences;
			state.dayCounts = parsed.data.dayCounts ?? {};
			state.weeklyCap = parsed.data.weeklyCap ?? 4;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.preferences_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	/**
	 * Save preferences (optimistic update)
	 */
	async save(data: PreferencesUpdate, routeDetails?: RouteDetail[]) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.preferences;
		const now = new Date();
		const mutationKey = 'preferences:save';
		const mutationVersion = nextMutationVersion(mutationKey);

		// Optimistic update
		state.preferences = {
			id: original?.id ?? 'optimistic',
			userId: original?.userId ?? '',
			preferredDays: data.preferredDays,
			preferredRoutes: data.preferredRoutes,
			preferredRoutesDetails: routeDetails ?? original?.preferredRoutesDetails ?? [],
			updatedAt: now,
			lockedAt: original?.lockedAt ?? null
		};
		state.isSaving = true;

		try {
			const res = await fetch('/api/preferences', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!res.ok) {
				throw new Error('Failed to save preferences');
			}

			const parsed = preferencesResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid preferences response');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			state.preferences = parsed.data.preferences;

			toastStore.success(m.preferences_saved_success());
		} catch (err) {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			// Rollback
			state.preferences = original;
			toastStore.error(m.preferences_save_error());
		} finally {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				state.isSaving = false;
			}
		}
	},

	/**
	 * Toggle a preferred day
	 */
	toggleDay(day: number, routeDetails?: RouteDetail[]) {
		const currentDays = state.preferences?.preferredDays ?? [];
		const isRemoving = currentDays.includes(day);

		if (!isRemoving && currentDays.length >= state.weeklyCap) {
			toastStore.error(m.preferences_days_max({ max: String(state.weeklyCap) }));
			return;
		}

		const newDays = isRemoving
			? currentDays.filter((d) => d !== day)
			: [...currentDays, day].sort((a, b) => a - b);

		this.save(
			{
				preferredDays: newDays,
				preferredRoutes: state.preferences?.preferredRoutes ?? []
			},
			routeDetails ?? state.preferences?.preferredRoutesDetails
		);
	},

	/**
	 * Update preferred routes
	 */
	updateRoutes(routeIds: string[], routeDetails: RouteDetail[]) {
		this.save(
			{
				preferredDays: state.preferences?.preferredDays ?? [],
				preferredRoutes: routeIds
			},
			routeDetails
		);
	}
};
