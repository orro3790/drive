/**
 * Driver Preferences Store
 *
 * Manages driver preferences state with optimistic UI updates.
 * Handles preferred days and routes selection.
 */

import type { PreferencesUpdate } from '$lib/schemas/preferences';
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
	isLocked: boolean;
	lockDeadline: Date | null;
	lockedUntil: Date | null;
	isLoading: boolean;
	isSaving: boolean;
	error: string | null;
}>({
	preferences: null,
	isLocked: false,
	lockDeadline: null,
	lockedUntil: null,
	isLoading: false,
	isSaving: false,
	error: null
});

export const preferencesStore = {
	get preferences() {
		return state.preferences;
	},
	get isLocked() {
		return state.isLocked;
	},
	get lockDeadline() {
		return state.lockDeadline;
	},
	get lockedUntil() {
		return state.lockedUntil;
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

			const data = await res.json();

			state.preferences = data.preferences
				? {
						...data.preferences,
						updatedAt: new Date(data.preferences.updatedAt),
						lockedAt: data.preferences.lockedAt ? new Date(data.preferences.lockedAt) : null
					}
				: null;
			state.isLocked = data.isLocked;
			state.lockDeadline = data.lockDeadline ? new Date(data.lockDeadline) : null;
			state.lockedUntil = data.lockedUntil ? new Date(data.lockedUntil) : null;
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

		if (state.isLocked) {
			toastStore.error(m.preferences_locked_error());
			return;
		}

		const original = state.preferences;
		const now = new Date();

		// Optimistic update
		state.preferences = {
			id: original?.id ?? 'optimistic',
			userId: original?.userId ?? '',
			preferredDays: data.preferredDays,
			preferredRoutes: data.preferredRoutes,
			preferredRoutesDetails: routeDetails ?? [],
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
				if (res.status === 423) {
					state.isLocked = true;
					throw new Error('locked');
				}
				throw new Error('Failed to save preferences');
			}

			const result = await res.json();
			state.preferences = {
				...result.preferences,
				updatedAt: new Date(result.preferences.updatedAt),
				lockedAt: result.preferences.lockedAt ? new Date(result.preferences.lockedAt) : null
			};
			state.isLocked = result.isLocked;
			state.lockDeadline = result.lockDeadline ? new Date(result.lockDeadline) : null;

			toastStore.success(m.preferences_saved_success());
		} catch (err) {
			// Rollback
			state.preferences = original;

			if (err instanceof Error && err.message === 'locked') {
				toastStore.error(m.preferences_locked_error());
			} else {
				toastStore.error(m.preferences_save_error());
			}
		} finally {
			state.isSaving = false;
		}
	},

	/**
	 * Toggle a preferred day
	 */
	toggleDay(day: number, routeDetails?: RouteDetail[]) {
		const currentDays = state.preferences?.preferredDays ?? [];
		const newDays = currentDays.includes(day)
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
