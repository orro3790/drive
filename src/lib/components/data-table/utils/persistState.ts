import type { TableState } from '@tanstack/table-core';

export function getTableStorageKey(tableId: string, route: string): string {
	return `driver:table:${tableId}:${route}`;
}

export function loadTableState(key: string): Partial<TableState> | null {
	if (typeof window === 'undefined') return null;
	try {
		const stored = localStorage.getItem(key);
		return stored ? (JSON.parse(stored) as Partial<TableState>) : null;
	} catch {
		return null;
	}
}

export function saveTableState(key: string, state: Partial<TableState>): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(key, JSON.stringify(state));
	} catch {
		// Intentionally ignore localStorage errors (quota exceeded, incognito mode, etc.)
	}
}
