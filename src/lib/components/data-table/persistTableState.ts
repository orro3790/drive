import type { TableState } from '@tanstack/table-core';
import { debounce } from '$lib/stores/helpers/debounce';

export type PersistedTableState = Partial<
	Pick<
		TableState,
		| 'columnFilters'
		| 'columnVisibility'
		| 'columnOrder'
		| 'columnPinning'
		| 'columnSizing'
		| 'pagination'
		| 'sorting'
	>
>;

const DEFAULT_WAIT_MS = 250;

export function loadPersistedTableState(key: string): PersistedTableState | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as PersistedTableState;
	} catch {
		try {
			window.localStorage.removeItem(key);
		} catch {
			// ignore
		}
		return null;
	}
}

export function createTableStatePersister(key: string, wait = DEFAULT_WAIT_MS) {
	let lastSerialized: string | null = null;

	const write = (state: unknown) => {
		if (!state || typeof state !== 'object') return;
		const nextState = state as PersistedTableState;
		if (typeof window === 'undefined') return;
		try {
			const serialized = JSON.stringify(nextState);
			if (serialized === lastSerialized) return;
			window.localStorage.setItem(key, serialized);
			lastSerialized = serialized;
		} catch {
			// ignore write failures
		}
	};

	const persist = debounce(write, wait);

	const clear = () => {
		persist.cancel();
		lastSerialized = null;
		if (typeof window !== 'undefined') {
			try {
				window.localStorage.removeItem(key);
			} catch {
				// ignore
			}
		}
	};

	return {
		persist,
		clear,
		flush: () => persist.flush()
	};
}
