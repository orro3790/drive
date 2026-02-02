/**
 * DataTable Component Module
 *
 * A reusable, TanStack Table-powered data table component for Svelte 5.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { DataTable, createSvelteTable, getCoreRowModel } from '$lib/components/data-table';
 *   import type { DataTableColumnDef } from '$lib/components/data-table';
 *
 *   interface User {
 *     id: string;
 *     name: string;
 *     email: string;
 *   }
 *
 *   const columns: DataTableColumnDef<User>[] = [
 *     { accessorKey: 'name', header: 'Name' },
 *     { accessorKey: 'email', header: 'Email' },
 *   ];
 *
 *   let data = $state<User[]>([]);
 *
 *   const table = createSvelteTable(() => ({
 *     data,
 *     columns,
 *     getCoreRowModel: getCoreRowModel(),
 *   }));
 * </script>
 *
 * <DataTable {table} />
 * ```
 */

// Svelte 5 adapters
export { createSvelteTable } from './createSvelteTable.svelte.js';

// Components
export { default as DataTable } from './DataTable.svelte';
export { default as DataTableHeader } from './DataTableHeader.svelte';
export { default as DataTableBody } from './DataTableBody.svelte';
export { default as DataTableVirtualBody } from './DataTableVirtualBody.svelte';
export { default as DataTableFooter } from './DataTableFooter.svelte';
export { default as DataTablePagination } from './DataTablePagination.svelte';
export { default as DataTableEmpty } from './DataTableEmpty.svelte';
export { default as DataTableColumnVisibility } from './DataTableColumnVisibility.svelte';
export { default as DataTableExportButton } from './DataTableExportButton.svelte';
export { default as DataTableFilterPanel } from './DataTableFilterPanel.svelte';
export { default as DataTableFilterDropdown } from './DataTableFilterDropdown.svelte';
export { default as DataTableFilterRange } from './DataTableFilterRange.svelte';
export { default as DataTableMobileDetail } from './DataTableMobileDetail.svelte';

// Cell renderers
export { default as CellText } from './cells/CellText.svelte';
export { default as CellNumber } from './cells/CellNumber.svelte';
export { default as CellDate } from './cells/CellDate.svelte';
export { default as CellRatio } from './cells/CellRatio.svelte';
export { default as CellActions } from './cells/CellActions.svelte';
export { default as CellBadge } from './cells/CellBadge.svelte';

// Column helpers
export { createColumnHelper } from './columnHelpers.js';

// Types
export type {
	DataTableColumnDef,
	DataTableColumnMeta,
	CellRendererProps,
	CellRenderer,
	CellSnippets,
	CellComponentSnippets,
	CellRendererContext,
	HeaderSnippets,
	HeaderRendererContext,
	RowClickHandler,
	RowClassFn,
	RowSelectableFn,
	ColumnSizing,
	ColumnAlignment,
	SortDirection,
	FilterType
} from './types.js';

// Utils
export { exportTableToCsv, type ExportScope, type ExportOptions } from './utils/exportCsv.js';
export { getTableStorageKey, loadTableState, saveTableState } from './utils/persistState.js';

// Re-export commonly used TanStack Table utilities
export {
	// Row models
	getCoreRowModel,
	getSortedRowModel,
	getPaginationRowModel,
	getFilteredRowModel,
	getGroupedRowModel,
	getExpandedRowModel,
	// Faceting utilities
	getFacetedRowModel,
	getFacetedUniqueValues,
	getFacetedMinMaxValues
} from '@tanstack/table-core';

// Re-export commonly used TanStack Table types
export type {
	// Core types
	Table,
	Column,
	Row,
	Cell,
	Header,
	HeaderGroup,
	RowData,
	ColumnDef,
	// State types
	TableState,
	SortingState,
	PaginationState,
	VisibilityState,
	RowSelectionState,
	ExpandedState,
	ColumnFiltersState,
	// Option types
	TableOptions,
	FilterFn,
	// Utility types
	Updater
} from '@tanstack/table-core';
