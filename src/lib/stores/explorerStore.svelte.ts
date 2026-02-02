/**
 * Shared explorer state store.
 *
 * Manages filter state (query, filters, view mode) shared between
 * ExplorerList and ExplorerMap components. Data fetching is handled
 * separately by each component.
 */

type ViewMode = 'list' | 'map' | 'split';

interface ExplorerFilters {
	district?: string;
	salesStatus?: string;
	status?: string;
}

interface ExplorerState {
	query: string;
	filters: ExplorerFilters;
	viewMode: ViewMode;
	queuePanelOpen: boolean;
	hoveredAcademyId: string | null;
	selectedAcademyId: string | null;
	detailPanePinned: boolean;
}

// Internal state
const state = $state<ExplorerState>({
	query: '',
	filters: {},
	viewMode: 'map', // Default to map for backward compatibility
	queuePanelOpen: false,
	hoveredAcademyId: null,
	selectedAcademyId: null,
	detailPanePinned: true
});

/**
 * Get the current search query.
 */
export function getQuery(): string {
	return state.query;
}

/**
 * Set the search query.
 */
export function setQuery(query: string): void {
	state.query = query;
}

/**
 * Get the current filters.
 */
export function getFilters(): ExplorerFilters {
	return state.filters;
}

/**
 * Set filters (merges with existing).
 */
export function setFilters(filters: Partial<ExplorerFilters>): void {
	state.filters = { ...state.filters, ...filters };
}

/**
 * Reset all filters to empty.
 */
export function resetFilters(): void {
	state.filters = {};
	state.query = '';
}

/**
 * Get the current view mode.
 */
export function getViewMode(): ViewMode {
	return state.viewMode;
}

/**
 * Set the view mode.
 */
export function setViewMode(mode: ViewMode): void {
	state.viewMode = mode;
}

/**
 * Get queue panel open state.
 */
export function getQueuePanelOpen(): boolean {
	return state.queuePanelOpen;
}

/**
 * Set queue panel open state.
 */
export function setQueuePanelOpen(open: boolean): void {
	state.queuePanelOpen = open;
}

/**
 * Toggle queue panel open state.
 */
export function toggleQueuePanel(): void {
	state.queuePanelOpen = !state.queuePanelOpen;
}

/**
 * Get hovered academy ID.
 */
export function getHoveredAcademyId(): string | null {
	return state.hoveredAcademyId;
}

/**
 * Set hovered academy ID.
 */
export function setHoveredAcademyId(id: string | null): void {
	state.hoveredAcademyId = id;
}

/**
 * Get selected academy ID.
 */
export function getSelectedAcademyId(): string | null {
	return state.selectedAcademyId;
}

/**
 * Set selected academy ID.
 */
export function setSelectedAcademyId(id: string | null): void {
	state.selectedAcademyId = id;
}

/**
 * Get detail pane pinned state.
 */
export function getDetailPanePinned(): boolean {
	return state.detailPanePinned;
}

/**
 * Set detail pane pinned state.
 */
export function setDetailPanePinned(pinned: boolean): void {
	state.detailPanePinned = pinned;
}

/**
 * Toggle detail pane pinned state.
 */
export function toggleDetailPanePinned(): void {
	state.detailPanePinned = !state.detailPanePinned;
}

/**
 * Get the full explorer state (for debugging or serialization).
 */
export function getExplorerState(): ExplorerState {
	return state;
}

export type { ViewMode, ExplorerFilters, ExplorerState };
