/**
 * Pipeline state store for kanban board.
 *
 * Manages column data, selected academy, pending moves, and today's work panel.
 */

import type {
	PipelineColumn,
	PipelineCard,
	PipelineResponse,
	SalesStatus
} from '$lib/schemas/pipeline';

interface PendingMove {
	academyId: string;
	from: SalesStatus;
	to: SalesStatus;
	card: PipelineCard;
}

interface PipelineState {
	columns: Map<SalesStatus, PipelineColumn>;
	selectedAcademyId: string | null;
	pendingMove: PendingMove | null;
	todaysWorkOpen: boolean;
	loading: boolean;
	error: string | null;
	todaysWork: {
		followupsDue: PipelineCard[];
		staleDeals: PipelineCard[];
		hotLeads: PipelineCard[];
	};
}

// Internal state
const state = $state<PipelineState>({
	columns: new Map(),
	selectedAcademyId: null,
	pendingMove: null,
	todaysWorkOpen: false,
	loading: false,
	error: null,
	todaysWork: {
		followupsDue: [],
		staleDeals: [],
		hotLeads: []
	}
});

/**
 * Get all columns as a Map.
 */
export function getColumns(): Map<SalesStatus, PipelineColumn> {
	return state.columns;
}

/**
 * Get columns as an ordered array.
 */
export function getColumnsArray(): PipelineColumn[] {
	return Array.from(state.columns.values());
}

/**
 * Set columns from API response.
 */
export function setColumns(columns: PipelineColumn[]): void {
	const map = new Map<SalesStatus, PipelineColumn>();
	for (const column of columns) {
		map.set(column.status, column);
	}
	state.columns = map;
}

/**
 * Get a specific column by status.
 */
export function getColumn(status: SalesStatus): PipelineColumn | undefined {
	return state.columns.get(status);
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
 * Get pending move state.
 */
export function getPendingMove(): PendingMove | null {
	return state.pendingMove;
}

/**
 * Start a move operation (card dragged to new column).
 * This stores the pending move for confirmation via modal.
 */
export function startMove(academyId: string, from: SalesStatus, to: SalesStatus): void {
	const fromColumn = state.columns.get(from);
	if (!fromColumn) return;

	const card = fromColumn.academies.find((c) => c.id === academyId);
	if (!card) return;

	state.pendingMove = {
		academyId,
		from,
		to,
		card
	};
}

/**
 * Confirm the pending move after call log is completed.
 * This finalizes the optimistic update.
 */
export function confirmMove(): void {
	state.pendingMove = null;
}

/**
 * Cancel the pending move and revert card position.
 */
export function cancelMove(): void {
	if (!state.pendingMove) return;

	const { academyId, from, to, card } = state.pendingMove;

	// Remove from target column
	const toColumn = state.columns.get(to);
	if (toColumn) {
		toColumn.academies = toColumn.academies.filter((c) => c.id !== academyId);
		toColumn.count = Math.max(0, toColumn.count - 1);
	}

	// Add back to source column
	const fromColumn = state.columns.get(from);
	if (fromColumn) {
		fromColumn.academies = [card, ...fromColumn.academies];
		fromColumn.count += 1;
	}

	state.pendingMove = null;
}

/**
 * Move a card optimistically to a new column.
 * Call this before opening the confirmation modal.
 */
export function moveCard(academyId: string, toStatus: SalesStatus): void {
	// Find current column containing the card
	let sourceColumn: PipelineColumn | undefined;
	let card: PipelineCard | undefined;

	for (const column of state.columns.values()) {
		const found = column.academies.find((c) => c.id === academyId);
		if (found) {
			card = found;
			sourceColumn = column;
			break;
		}
	}

	if (!card || !sourceColumn || sourceColumn.status === toStatus) return;

	// Remove from source column
	sourceColumn.academies = sourceColumn.academies.filter((c) => c.id !== academyId);
	sourceColumn.count = Math.max(0, sourceColumn.count - 1);

	// Add to target column
	const targetColumn = state.columns.get(toStatus);
	if (targetColumn) {
		targetColumn.academies = [card, ...targetColumn.academies];
		targetColumn.count += 1;
	}
}

/**
 * Get today's work panel open state.
 */
export function getTodaysWorkOpen(): boolean {
	return state.todaysWorkOpen;
}

/**
 * Set today's work panel open state.
 */
export function setTodaysWorkOpen(open: boolean): void {
	state.todaysWorkOpen = open;
}

/**
 * Toggle today's work panel.
 */
export function toggleTodaysWork(): void {
	state.todaysWorkOpen = !state.todaysWorkOpen;
}

/**
 * Get loading state.
 */
export function getLoading(): boolean {
	return state.loading;
}

/**
 * Set loading state.
 */
export function setLoading(loading: boolean): void {
	state.loading = loading;
}

/**
 * Get error state.
 */
export function getError(): string | null {
	return state.error;
}

/**
 * Set error state.
 */
export function setError(error: string | null): void {
	state.error = error;
}

/**
 * Get today's work data.
 */
export function getTodaysWork(): PipelineState['todaysWork'] {
	return state.todaysWork;
}

/**
 * Set today's work data.
 */
export function setTodaysWork(todaysWork: PipelineState['todaysWork']): void {
	state.todaysWork = todaysWork;
}

/**
 * Initialize store from API response.
 */
export function initializeFromResponse(response: PipelineResponse): void {
	setColumns(response.columns);
	setTodaysWork(response.todaysWork);
	setError(null);
}

/**
 * Get the full pipeline state (for debugging).
 */
export function getPipelineState(): PipelineState {
	return state;
}

export type { PendingMove, PipelineState };
