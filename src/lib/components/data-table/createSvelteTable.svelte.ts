/**
 * Svelte 5 adapter for TanStack Table
 *
 * This adapter bridges @tanstack/table-core with Svelte 5's reactivity system.
 * It uses $state and $effect to manage table state reactively.
 *
 * @see https://tanstack.com/table/latest/docs/installation (Svelte 5 note)
 * @see https://github.com/TanStack/table/pull/5403 (reference implementation)
 */
import { untrack } from 'svelte';
import {
	createTable,
	type RowData,
	type Table,
	type TableOptions,
	type TableOptionsResolved,
	type TableState,
	type Updater
} from '@tanstack/table-core';

/**
 * Resolves an updater value - handles both direct values and updater functions.
 * TanStack Table's state setters can receive either a new value directly
 * or a function that takes the previous value and returns the new value.
 */
function resolveUpdater<T>(updater: Updater<T>, previousValue: T): T {
	return typeof updater === 'function' ? (updater as (prev: T) => T)(previousValue) : updater;
}

/**
 * Options for creating a Svelte 5 table instance.
 * Extends TanStack's TableOptions but makes state/onStateChange optional
 * since we manage them internally.
 */
export type SvelteTableOptions<TData extends RowData> = Omit<
	TableOptions<TData>,
	'state' | 'onStateChange' | 'renderFallbackValue'
> & {
	state?: Partial<TableState>;
	onStateChange?: (updater: Updater<TableState>) => void;
	renderFallbackValue?: unknown;
};

/**
 * Creates a reactive TanStack Table instance for Svelte 5.
 *
 * @param options - A function that returns table options. Must be a function
 *                  so that Svelte can track reactive dependencies (e.g., data changes).
 * @returns A reactive table instance
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { createSvelteTable, getCoreRowModel } from '$lib/components/data-table';
 *
 *   let data = $state([...]);
 *   const columns = [...];
 *
 *   const table = createSvelteTable(() => ({
 *     data,
 *     columns,
 *     getCoreRowModel: getCoreRowModel(),
 *   }));
 * </script>
 * ```
 */
export function createSvelteTable<TData extends RowData>(
	options: () => SvelteTableOptions<TData>
): Table<TData> {
	// Get initial options to create the table
	const initialOptions = options();

	// Create the table with resolved options
	const resolvedOptions: TableOptionsResolved<TData> = {
		state: {},
		onStateChange: () => {},
		renderFallbackValue: null,
		...initialOptions
	};

	const table = createTable(resolvedOptions) as Table<TData> & {
		/** Internal hook to make Svelte reactivity aware of table state changes */
		track?: () => void;
	};

	// Initialize state with table defaults merged with any provided initial state
	let tableState = $state<TableState>({
		...table.initialState,
		...initialOptions.state
	});

	// Version signal to trigger Svelte reactivity from consumers
	let version = $state(0);
	const bump = () => {
		version += 1;
	};
	table.track = () => {
		// Access version so Svelte tracks it in $derived.by consumers
		void version;
	};

	// Track the latest options for use in onStateChange callback
	let latestOptions = $state(initialOptions);

	// Helper to sync options with the table
	const syncOptions = (currentOptions: SvelteTableOptions<TData>, getState: () => TableState) => {
		latestOptions = currentOptions;
		table.setOptions((prev) => ({
			...prev,
			...currentOptions,
			state: {
				...getState(),
				...currentOptions.state
			},
			onStateChange: (updater) => {
				// Update our internal state
				// Avoid capturing an initial snapshot of $state in this callback.
				// Read it at call time so Svelte 5 doesn't warn about "state referenced locally".
				const newState = resolveUpdater(
					updater,
					untrack(() => tableState)
				);
				tableState = newState;

				// IMMEDIATELY sync the new state to the table.
				// This is critical because TanStack's memoized getters (getHeaderGroups, etc.)
				// won't reflect the new state until we call setOptions with it.
				table.setOptions((prev) => ({
					...prev,
					state: {
						...newState,
						...latestOptions.state
					}
				}));

				// Notify reactive consumers
				bump();

				// Also call user's onStateChange if provided
				latestOptions.onStateChange?.(updater);
			}
		}));
	};

	// CRITICAL: Apply options synchronously BEFORE returning the table.
	// Without this, SSR and first render fail because table isn't configured.
	syncOptions(initialOptions, () => tableState);

	// Sync options with table - this effect runs when external options OR internal tableState changes
	$effect(() => {
		const currentOptions = options();
		// Ensure this effect re-runs when tableState changes.
		void tableState;

		untrack(() => {
			syncOptions(currentOptions, () => tableState);
			// Notify reactive consumers of data/option changes
			bump();
		});
	});

	return table;
}
