<!--
@component DataTableBody
Renders the table body with rows and cells.

Supports two types of custom cell rendering:
- `cells`: Simple snippets that receive row data (existing pattern)
- `cellComponents`: Rich snippets that receive full cell context (value, selection, expansion, etc.)

Priority: cellComponents > cells > columnDef.cell > default rendering
-->
<script lang="ts" generics="RowType">
	import * as m from '$lib/paraglide/messages.js';
	import { on } from 'svelte/events';
	import type { Table, Cell, ColumnPinningState } from '@tanstack/table-core';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import Tooltip from '$lib/components/primitives/Tooltip.svelte';
	import type {
		RowClickHandler,
		RowClassFn,
		RowSelectableFn,
		DisabledSelectionReasonFn,
		CellSnippets,
		CellComponentSnippets,
		CellRendererContext,
		DataTableColumnMeta
	} from './types';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';

	type Props = {
		table: Table<RowType>;
		showIndex?: boolean;
		showSelection?: boolean;
		showExpand?: boolean;
		onRowClick?: RowClickHandler<RowType>;
		/** Handler called when mouse enters/leaves a row (null when leaving) */
		onRowHover?: (row: RowType | null) => void;
		rowClass?: RowClassFn<RowType>;
		isRowSelectable?: RowSelectableFn<RowType>;
		getDisabledSelectionReason?: DisabledSelectionReasonFn<RowType>;
		activeRowId?: string;
		currentPage?: number;
		pageSize?: number;
		/** Simple cell snippets - receive row data only (legacy pattern) */
		cells?: CellSnippets<RowType>;
		/** Rich cell component snippets - receive full cell context (value, selection, expansion, etc.) */
		cellComponents?: CellComponentSnippets<RowType>;
		/** Whether the table is in mobile mode (<600px) */
		isMobile?: boolean;
		/** Handler called when a row is tapped on mobile to open detail panel */
		onMobileRowTap?: (row: RowType) => void;
		/** Show an empty filler column at the end to absorb remaining width */
		showFiller?: boolean;
	};

	let {
		table,
		showIndex = false,
		showSelection = false,
		showExpand = false,
		onRowClick,
		onRowHover,
		rowClass,
		isRowSelectable,
		getDisabledSelectionReason,
		activeRowId,
		currentPage = 0,
		pageSize = 10,
		cells,
		cellComponents,
		isMobile = false,
		onMobileRowTap,
		showFiller = false
	}: Props = $props();

	type ReactiveTable<T> = Table<T> & { track?: () => void };
	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	const rows = $derived.by(() => {
		// Track internal table state changes for reactivity
		reactiveTable.track?.();
		// Force new array reference to ensure Svelte 5 updates {#each} blocks
		// even if row objects are referentially stable from TanStack's memoization
		return [...reactiveTable.getRowModel().rows];
	});

	// Derive expanded state separately to ensure reactivity when row objects are memoized.
	// TanStack memoizes row objects, so row.getIsExpanded() changes don't trigger re-renders
	// unless we derive from table state directly.
	const expandedState = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().expanded as Record<string, boolean>;
	});

	// Same pattern for selection state
	const selectionState = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().rowSelection as Record<string, boolean>;
	});

	// Derive column visibility state for row key - forces row re-render when columns change
	const columnVisibility = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnVisibility as Record<string, boolean>;
	});

	// Create a simple key that changes when column visibility changes
	const visibleColumnsKey = $derived(
		Object.entries(columnVisibility)
			.filter(([, visible]) => visible === false)
			.map(([id]) => id)
			.join(',')
	);

	// Derive column sizing state for reactivity and layout decisions
	const columnSizing = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnSizing as Record<string, number>;
	});

	// Derive column pinning state for reactivity
	const columnPinning = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnPinning as ColumnPinningState;
	});

	// Simple key so row rendering responds to pin/unpin
	const columnPinningKey = $derived(
		`${(columnPinning.left ?? []).join(',')}|${(columnPinning.right ?? []).join(',')}`
	);

	// Get pinned offset for a column
	function getPinnedOffset(cell: Cell<RowType, unknown>): number | undefined {
		const pinned = cell.column.getIsPinned();
		if (!pinned) return undefined;

		if (pinned === 'left') {
			return cell.column.getStart('left');
		}
		if (pinned === 'right') {
			return cell.column.getAfter('right');
		}
		return undefined;
	}

	const selectionEnabled = $derived(showSelection && !!table.getToggleAllRowsSelectedHandler);

	function stopRowClick(node: HTMLElement) {
		const off = on(node, 'click', (event) => event.stopPropagation());
		return { destroy: off };
	}

	function handleRowClick(row: RowType, event: MouseEvent) {
		// On mobile, open detail panel INSTEAD of triggering onRowClick
		// The detail panel provides access to all row data and can include navigation
		if (isMobile && onMobileRowTap) {
			onMobileRowTap(row);
			return;
		}
		// Desktop: call onRowClick for navigation/selection
		onRowClick?.(row, event);
	}

	function handleRowKeyDown(row: RowType, event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			// On mobile, open detail panel INSTEAD of triggering onRowClick
			if (isMobile && onMobileRowTap) {
				onMobileRowTap(row);
				return;
			}
			onRowClick?.(row, event as unknown as MouseEvent);
		}
	}

	function getRowIndex(index: number): number {
		return currentPage * pageSize + index + 1;
	}

	function getCellValue(cell: Cell<RowType, unknown>): unknown {
		return cell.getValue();
	}

	function getCellMeta(cell: Cell<RowType, unknown>) {
		return cell.column.columnDef.meta ?? {};
	}

	function renderCellContent(cell: Cell<RowType, unknown>): string {
		const value = getCellValue(cell);

		// Handle null/undefined
		if (value == null) return '—';

		// Handle dates
		if (value instanceof Date) {
			return value.toLocaleDateString();
		}

		// Handle numbers
		if (typeof value === 'number') {
			return value.toLocaleString();
		}

		// Default: convert to string
		return String(value);
	}

	function canSelectRow(rowApi: (typeof rows)[number]): boolean {
		const rowData = rowApi.original;
		if (typeof isRowSelectable === 'function') {
			return isRowSelectable(rowData);
		}
		return rowApi.getCanSelect?.() ?? true;
	}
</script>

<tbody>
	{#each rows as row, index (`${row.id}-${expandedState[row.id] ?? false}-${selectionState[row.id] ?? false}-${visibleColumnsKey}-${columnPinningKey}`)}
		{@const rowData = row.original}
		{@const extraClass = rowClass?.(rowData, index) ?? ''}
		{@const rowIsSelected = selectionState[row.id] ?? false}
		{@const rowCanSelect = canSelectRow(row)}
		{@const rowDepth = row.depth ?? 0}
		{@const canExpand = row.getCanExpand?.() ?? false}
		{@const isExpanded = expandedState[row.id] ?? false}
		{@const isRowClickable = !!onRowClick || !!(isMobile && onMobileRowTap)}
		<tr
			class="data-table-row {extraClass}"
			class:clickable={isRowClickable}
			class:row-active={activeRowId === row.id}
			data-depth={rowDepth}
			onclick={(e) => isRowClickable && handleRowClick(rowData, e)}
			onkeydown={(e) => isRowClickable && handleRowKeyDown(rowData, e)}
			onmouseenter={() => onRowHover?.(rowData)}
			onmouseleave={() => onRowHover?.(null)}
			tabindex={isRowClickable ? 0 : undefined}
		>
			{#if selectionEnabled}
				<td class="col-select">
					<div class="cell-center" use:stopRowClick>
						{#if rowCanSelect}
							<Checkbox
								checked={rowIsSelected}
								ariaLabel={m.table_row_select({ index: getRowIndex(index).toString() })}
								disabled={!rowCanSelect}
								onclick={(event) => event.stopPropagation()}
								onchange={row.getToggleSelectedHandler?.()}
							/>
						{:else}
							{@const disabledReason = getDisabledSelectionReason?.(rowData)}
							<Tooltip
								tooltip={disabledReason ?? m.table_row_cannot_be_selected()}
								position="right"
								delay={300}
								focusable={false}
							>
								<Checkbox
									checked={false}
									ariaLabel={disabledReason ?? m.table_row_selection_disabled()}
									disabled={true}
									onclick={(event) => event.stopPropagation()}
								/>
							</Tooltip>
						{/if}
					</div>
				</td>
			{/if}
			{#if showExpand}
				<td class="col-expand">
					<div class="cell-center">
						{#if canExpand}
							<button
								type="button"
								class="expand-toggle"
								aria-expanded={isExpanded}
								aria-label={isExpanded ? m.table_row_collapse() : m.table_row_expand()}
								onclick={(event) => {
									event.stopPropagation();
									row.toggleExpanded?.();
								}}
								onkeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										row.toggleExpanded?.();
									}
								}}
							>
								<div class="expand-icon" class:expanded={isExpanded}>
									<Icon><ChevronRight /></Icon>
								</div>
							</button>
						{:else}
							<span class="indent-spacer" aria-hidden="true"></span>
						{/if}
					</div>
				</td>
			{/if}
			{#if showIndex}
				<td class="col-index">{getRowIndex(index)}</td>
			{/if}
			{#each row.getVisibleCells() as cell (cell.id)}
				{@const meta = getCellMeta(cell)}
				{@const columnDef = cell.column.columnDef}
				{@const cellComponentSnippet = cellComponents?.[cell.column.id]}
				{@const cellSnippet = cells?.[cell.column.id]}
				{@const pinnedPosition = cell.column.getIsPinned()}
				{@const pinnedOffset = getPinnedOffset(cell)}
				{@const isResizingEnabled = table.options.enableColumnResizing}
				{@const shouldApplySizing = isResizingEnabled}
				{@const dynamicWidth = shouldApplySizing
					? (columnSizing[cell.column.id] ?? cell.column.getSize())
					: undefined}
				{@const cellContext = {
					value: getCellValue(cell),
					row: rowData,
					rowId: row.id,
					rowIndex: getRowIndex(index) - 1,
					columnId: cell.column.id,
					meta: meta as DataTableColumnMeta,
					isSelected: rowIsSelected,
					isExpanded
				} satisfies CellRendererContext<RowType>}
				<td
					class="data-table-td"
					class:sticky-left={meta.stickyLeft || pinnedPosition === 'left'}
					class:pinned-left={pinnedPosition === 'left'}
					class:pinned-right={pinnedPosition === 'right'}
					class:align-left={meta.align === 'left' || !meta.align}
					class:align-center={meta.align === 'center' || meta.align === 'separator'}
					class:align-right={meta.align === 'right'}
					class:tabular-nums={meta.align === 'right'}
					class:sizing-hug={meta.sizing === 'hug' || !meta.sizing}
					class:sizing-fill={meta.sizing === 'fill' && !shouldApplySizing}
					class:sizing-fixed={meta.sizing === 'fixed'}
					style:width={dynamicWidth
						? `${dynamicWidth}px`
						: meta.sizing === 'fixed' && meta.width
							? `${meta.width}px`
							: undefined}
					style:min-width={!shouldApplySizing && meta.minWidth ? `${meta.minWidth}px` : undefined}
					style:max-width={!shouldApplySizing && meta.maxWidth ? `${meta.maxWidth}px` : undefined}
					style:left={pinnedPosition === 'left' && pinnedOffset !== undefined
						? `${pinnedOffset}px`
						: undefined}
					style:right={pinnedPosition === 'right' && pinnedOffset !== undefined
						? `${pinnedOffset}px`
						: undefined}
				>
					{#if cellComponentSnippet}
						<!-- Rich cell component with full context -->
						{@render cellComponentSnippet(cellContext)}
					{:else if cellSnippet}
						{@render cellSnippet(rowData)}
					{:else if typeof columnDef.cell === 'function'}
						{@const rendered = columnDef.cell(cell.getContext())}
						{#if typeof rendered === 'string' || typeof rendered === 'number'}
							{rendered}
						{:else}
							<!-- For complex cell renderers, they should handle their own rendering -->
							{renderCellContent(cell)}
						{/if}
					{:else}
						{renderCellContent(cell)}
					{/if}
				</td>
			{/each}
			{#if showFiller}
				<td class="col-filler"></td>
			{/if}
		</tr>
	{/each}
</tbody>

<style>
	.data-table-row {
		transition:
			background-color var(--transition-all),
			box-shadow var(--transition-all);
	}

	.data-table-row:hover {
		background: var(--interactive-hover);
		box-shadow: inset 3px 0 0 var(--interactive-accent);
	}

	.data-table-row.clickable {
		cursor: pointer;
	}

	.data-table-row.clickable:focus {
		outline: none;
		background: var(--interactive-hover);
	}

	.data-table-row.clickable:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: -2px;
	}

	.data-table-row.row-active {
		background: var(--interactive-hover);
		box-shadow: inset 3px 0 0 var(--interactive-accent);
	}

	/* Ensure active row background persists on cells */
	.data-table-row.row-active .data-table-td,
	.data-table-row.row-active .col-select,
	.data-table-row.row-active .col-index,
	.data-table-row.row-active .col-expand,
	.data-table-row.row-active .pinned-left,
	.data-table-row.row-active .pinned-right {
		background: var(--interactive-hover);
	}

	.data-table-td {
		height: var(--data-table-row-min-height, 40px);
		padding: var(--spacing-2) var(--spacing-3);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		white-space: nowrap;
		color: var(--text-normal);
		background: var(--surface-primary); /* Default background */
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: middle;
		box-sizing: border-box;
	}

	/* Row hover: Highlight all cells */
	.data-table-row:hover .data-table-td,
	.data-table-row:hover .col-select,
	.data-table-row:hover .col-index,
	.data-table-row:hover .col-expand {
		background: var(--interactive-hover);
	}

	/* Ensure sticky cells inherit row hover */
	.data-table-row:hover .data-table-td.sticky-left {
		background: var(--interactive-hover);
	}

	/* Index column */
	.col-index {
		width: 48px;
		min-width: 48px;
		max-width: 48px;
		height: var(--data-table-row-min-height, 40px);
		text-align: center;
		color: var(--text-normal);
		font-variant-numeric: tabular-nums;
		padding: var(--spacing-2) var(--spacing-3);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		background: var(--surface-primary);
		vertical-align: middle;
		box-sizing: border-box;
	}

	.col-select {
		width: 36px;
		min-width: 36px;
		max-width: 36px;
		height: var(--data-table-row-min-height, 40px);
		padding: 0;
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		background: var(--surface-primary);
		vertical-align: middle;
		box-sizing: border-box;
	}

	.cell-center {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: var(--data-table-row-min-height, 40px); /* Ensure minimum click area */
	}

	.col-expand {
		width: 40px;
		min-width: 40px;
		max-width: 40px;
		height: var(--data-table-row-min-height, 40px);
		text-align: center;
		padding: 0;
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		vertical-align: middle;
		box-sizing: border-box;
	}

	.expand-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-base);
		color: var(--text-normal);
		cursor: pointer;
		/* No transition - syncs with row hover state */
	}

	.expand-toggle:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	/* Let the row hover handle visual feedback, not the button itself */
	.data-table-row:hover .expand-toggle {
		color: var(--text-normal);
	}

	.expand-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		transform-origin: center;
		transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Use :global to ensure the class is applied if Svelte scoping is interfering, 
	   though local scoping should work since we toggle the class in this file */
	.expand-icon.expanded {
		transform: rotate(90deg);
	}

	.indent-spacer {
		display: inline-block;
		width: 100%;
		height: 1px;
	}

	/* Alignment */
	.align-left {
		text-align: left;
	}

	.align-center {
		text-align: center;
	}

	.align-right {
		text-align: right;
	}

	/* Tabular numbers for right-aligned numeric data */
	.tabular-nums {
		font-variant-numeric: tabular-nums;
	}

	/* Pinned columns (left/right) - disabled on mobile for better horizontal scroll UX */
	@media (min-width: 768px) {
		.pinned-left,
		.pinned-right {
			position: sticky;
			z-index: 12;
			background: var(--surface-primary);
			transform: translate3d(
				0,
				0,
				0
			); /* Force hardware acceleration to prevent rendering artifacts */
		}

		.pinned-left {
			left: 0;
			box-shadow: inset -1px 0 0 var(--border-primary);
		}

		.pinned-right {
			right: 0;
			box-shadow: inset 1px 0 0 var(--border-primary);
		}

		/* Ensure pinned cells inherit row hover */
		.data-table-row:hover .pinned-left,
		.data-table-row:hover .pinned-right {
			background: var(--interactive-hover);
		}

		/* Legacy sticky left support */
		.sticky-left:not(.pinned-left):not(.pinned-right) {
			position: sticky;
			left: 0;
			z-index: 10;
		}
	}

	.sizing-fill {
		width: 100%;
	}

	.col-filler {
		width: auto;
		padding: 0;
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
	}

	.data-table-row:hover .col-filler {
		background: var(--interactive-hover);
	}

	.data-table-row.row-active .col-filler {
		background: var(--interactive-hover);
	}
</style>
