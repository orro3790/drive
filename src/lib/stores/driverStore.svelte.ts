/**
 * Driver Store
 *
 * Manages driver state for manager dashboard with optimistic UI updates.
 * All API calls are owned by this store.
 */

import type { Driver, DriverUpdate } from '$lib/schemas/driver';
import { driverSchema } from '$lib/schemas/driver';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';
import {
	dispatchPolicy,
	getAttendanceThreshold,
	isRewardEligible
} from '$lib/config/dispatchPolicy';

const state = $state<{
	drivers: Driver[];
	isLoading: boolean;
	error: string | null;
}>({
	drivers: [],
	isLoading: false,
	error: null
});

function deriveHealthState(
	driver: Pick<Driver, 'isFlagged' | 'attendanceRate' | 'totalShifts' | 'completionRate'>
): Driver['healthState'] {
	if (driver.isFlagged) {
		return 'flagged';
	}

	const attendanceThreshold = getAttendanceThreshold(driver.totalShifts);
	if (driver.attendanceRate < attendanceThreshold) {
		return 'at_risk';
	}

	if (
		driver.attendanceRate <
		attendanceThreshold + dispatchPolicy.flagging.ui.watchBandAboveThreshold
	) {
		return 'watch';
	}

	if (
		isRewardEligible(driver.totalShifts, driver.attendanceRate) &&
		driver.completionRate >= dispatchPolicy.flagging.reward.minAttendanceRate
	) {
		return 'high_performer';
	}

	return 'healthy';
}

function parseDriverPatch(input: unknown): Partial<Driver> {
	const parsed = driverSchema.partial().safeParse(input);
	if (!parsed.success) {
		throw new Error('Invalid driver payload');
	}

	return parsed.data;
}

function mergeDriver(existing: Driver, patch: Partial<Driver>): Driver {
	const merged: Driver = {
		...existing,
		...patch,
		attendanceThreshold: getAttendanceThreshold(patch.totalShifts ?? existing.totalShifts ?? 0)
	};

	return {
		...merged,
		healthState: deriveHealthState(merged)
	};
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
			const parsed = driverSchema.array().safeParse(data.drivers);
			if (!parsed.success) {
				throw new Error('Invalid drivers response');
			}
			state.drivers = parsed.data;
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
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.drivers.find((d) => d.id === id);
		if (!original) return;
		const mutationKey = `driver:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		// Optimistic update
		state.drivers = state.drivers.map((d) => (d.id === id ? { ...d, weeklyCap } : d));

		this._updateInDb(id, { weeklyCap }, original, mutationKey, mutationVersion);
	},

	/**
	 * Unflag a driver (optimistic)
	 */
	unflag(id: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.drivers.find((d) => d.id === id);
		if (!original) return;
		const mutationKey = `driver:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		// Optimistic update
		state.drivers = state.drivers.map((d) =>
			d.id === id ? { ...d, isFlagged: false, flagWarningDate: null } : d
		);

		this._unflagInDb(id, original, mutationKey, mutationVersion);
	},

	/**
	 * Reinstate a driver into the assignment pool (optimistic)
	 */
	reinstate(id: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.drivers.find((d) => d.id === id);
		if (!original) return;
		const mutationKey = `driver:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		// Optimistic update
		state.drivers = state.drivers.map((d) =>
			d.id === id ? { ...d, assignmentPoolEligible: true } : d
		);

		this._reinstateInDb(id, original, mutationKey, mutationVersion);
	},

	async _updateInDb(
		id: string,
		data: DriverUpdate,
		original: Driver,
		mutationKey: string,
		mutationVersion: number
	) {
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
			const parsedDriver = parseDriverPatch(driver);

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			state.drivers = state.drivers.map((d) => (d.id === id ? mergeDriver(d, parsedDriver) : d));
			toastStore.success(m.drivers_updated_success());
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				// Rollback
				state.drivers = state.drivers.map((d) => (d.id === id ? original : d));
				toastStore.error(m.drivers_update_error());
			}
		}
	},

	async _unflagInDb(id: string, original: Driver, mutationKey: string, mutationVersion: number) {
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
			const parsedDriver = parseDriverPatch(driver);

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			state.drivers = state.drivers.map((d) => (d.id === id ? mergeDriver(d, parsedDriver) : d));
			toastStore.success(m.drivers_unflagged_success());
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				// Rollback
				state.drivers = state.drivers.map((d) => (d.id === id ? original : d));
				toastStore.error(m.drivers_unflag_error());
			}
		}
	},

	async _reinstateInDb(id: string, original: Driver, mutationKey: string, mutationVersion: number) {
		try {
			const res = await fetch(`/api/drivers/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ reinstate: true })
			});

			if (!res.ok) {
				throw new Error('Failed to reinstate driver');
			}

			const { driver } = await res.json();
			const parsedDriver = parseDriverPatch(driver);

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) {
				return;
			}

			state.drivers = state.drivers.map((d) => (d.id === id ? mergeDriver(d, parsedDriver) : d));
			toastStore.success(m.drivers_reinstated_success());
		} catch {
			if (isLatestMutationVersion(mutationKey, mutationVersion)) {
				// Rollback
				state.drivers = state.drivers.map((d) => (d.id === id ? original : d));
				toastStore.error(m.drivers_reinstate_error());
			}
		}
	}
};
