/**
 * Academy map store for bounds-based fetching.
 *
 * Uses Svelte 5 runes via module-level state. Fetches academies from
 * /api/academies/bounds when map bounds change.
 */

import type { BoundsHit, BoundsResponse } from '$lib/schemas/academy-bounds';
import { getFilters } from './explorerStore.svelte';

/** Current state */
let academies = $state<BoundsHit[]>([]);
let isLoading = $state(false);
let error = $state<string | null>(null);

/** Last bounds request for refresh */
let lastBounds = $state<BBox | null>(null);

/** Get current academies */
export function getAcademies(): BoundsHit[] {
	return academies;
}

/** Get loading state */
export function getIsLoading(): boolean {
	return isLoading;
}

/** Get error state */
export function getError(): string | null {
	return error;
}

/** Bounding box format expected by API */
interface BBox {
	north: number;
	south: number;
	east: number;
	west: number;
}

/**
 * Fetch academies within the given bounding box.
 * Called on map moveend events.
 * Includes shared filters from explorerStore.
 */
export async function fetchByBounds(bbox: BBox): Promise<void> {
	lastBounds = bbox;
	isLoading = true;
	error = null;

	try {
		const filters = getFilters();
		const response = await fetch('/api/academies/bounds', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				bbox,
				limit: 100,
				filters: Object.keys(filters).length > 0 ? filters : undefined
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(errorData.error || `HTTP ${response.status}`);
		}

		const data: BoundsResponse = await response.json();
		academies = data.hits;
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to fetch academies';
		academies = [];
	} finally {
		isLoading = false;
	}
}

/**
 * Refresh the map by re-fetching with the last bounds.
 * Call after data changes (e.g., mark closed) to update markers.
 */
export async function refresh(): Promise<void> {
	if (lastBounds) {
		await fetchByBounds(lastBounds);
	}
}

/** Clear all academies */
export function clearAcademies(): void {
	academies = [];
	error = null;
}
