<!--
@component DataTable
A reusable data table component powered by TanStack Table.

Renders a semantic HTML table inside a card with sorting, pagination, and customizable cells.
Designed to work with the Driver Ops design system.

@example
```svelte
<script lang="ts">
  import { DataTable, createSvelteTable, getCoreRowModel, getSortedRowModel } from '$lib/components/data-table';
  
  const columns = [...];
  let data = $state([...]);
  
  const table = createSvelteTable(() => ({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  }));
</script>

<DataTable {table} />
```
-->
<script lang="ts" generics="RowType">
	import type { Snippet } from 'svelte';
	import type { Table } from '@tanstack/table-core';
	import type {
		RowClickHandler,
		RowClassFn,
		RowSelectableFn,
		DisabledSelectionReasonFn,
		CellSnippets,
		CellComponentSnippets,
		HeaderSnippets,
		WideModeChangeHandler,
		MobileDetailOpenHandler
	} from './types';
	import * as m from '$lib/paraglide/messages.js';
	import DataTableHeader from './DataTableHeader.svelte';
	import DataTableBody from './DataTableBody.svelte';
	import DataTableVirtualBody from './DataTableVirtualBody.svelte';
	import DataTableFooter from './DataTableFooter.svelte';
	import DataTableEmpty from './DataTableEmpty.svelte';
	import DataTableColumnVisibility from './DataTableColumnVisibility.svelte';
	import DataTableExportButton from './DataTableExportButton.svelte';
	import DataTableMobileDetail from './DataTableMobileDetail.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import ViewportWide from '$lib/components/icons/ViewportWide.svelte';

	type Props = {
		/** The TanStack Table instance */
		table: Table<RowType>;

		/** Whether data is currently loading */
		loading?: boolean;

		/** Error message to display */
		error?: string | null;

		/** Message to show when table has no data */
		emptyMessage?: string;

		/** Title for the empty state */
		emptyTitle?: string;

		/** Whether to show the index column */
		showIndex?: boolean;

		/** Whether to show selection checkboxes (defaults to table.enableRowSelection) */
		showSelection?: boolean;

		/** Whether to show pagination controls */
		showPagination?: boolean;

		/** Whether to show expand/collapse toggles for tree data */
		showExpand?: boolean;

		/** Handler called when a row is clicked */
		onRowClick?: RowClickHandler<RowType>;

		/** Handler called when mouse enters/leaves a row (null when leaving) */
		onRowHover?: (row: RowType | null) => void;

		/** Function to compute CSS classes for each row */
		rowClass?: RowClassFn<RowType>;

		/** Function to determine if a row can be selected */
		isRowSelectable?: RowSelectableFn<RowType>;

		/** Function to get reason why a row cannot be selected (for tooltip) */
		getDisabledSelectionReason?: DisabledSelectionReasonFn<RowType>;

		/** Active row id for highlight */
		activeRowId?: string;

		/** Tabs snippet (left chrome) */
		tabs?: Snippet;

		/** Toolbar snippet (right chrome) - rendered FIRST before built-in buttons */
		toolbar?: Snippet;

		/** Selection info snippet (left of toolbar actions) */
		selection?: Snippet;

		/** Footer snippet (custom content in footer center) */
		footer?: Snippet;

		/** Total row count before filtering (for "filtered from X" display) */
		totalRows?: number;

		/** Show column visibility toggle */
		showColumnVisibility?: boolean;

		/** Enable the wide mode toggle in chrome (for side panel vs modal switching) */
		showWideModeToggle?: boolean;

		/** Current wide mode state (true = modal mode, false = side panel mode) */
		isWideMode?: boolean;

		/** Callback when wide mode is toggled */
		onWideModeChange?: WideModeChangeHandler;

		/** Show export button */
		showExport?: boolean;

		/** Filename to use for CSV exports */
		exportFilename?: string;

		/** Custom empty state content */
		empty?: Snippet;

		/** Custom cell renderers - map column IDs to snippets (receives row data) */
		cells?: CellSnippets<RowType>;

		/** Rich cell component renderers - map column IDs to snippets with full context */
		cellComponents?: CellComponentSnippets<RowType>;

		/** Custom header renderers - map column IDs to snippets with header context */
		headers?: HeaderSnippets;

		/** Enable row virtualization for large datasets */
		virtualize?: boolean;

		/** Fixed row height in pixels (for virtualization) */
		rowHeight?: number;

		/** Number of extra rows to render outside viewport (for virtualization) */
		overscan?: number;

		/** Disable outer padding on the table wrapper */
		noPadding?: boolean;

		/** Whether to add a border to the table container */
		bordered?: boolean;

		/** Whether the table card has rounded corners (defaults to true) */
		rounded?: boolean;

		/** Additional CSS class for the table container */
		class?: string;

		/** Disable the built-in mobile detail panel (use when you have custom detail views) */
		disableMobileDetail?: boolean;

		/** Custom content for mobile detail panel - receives row data */
		mobileDetailContent?: Snippet<[RowType]>;

		/** Custom title for mobile detail panel */
		mobileDetailTitle?: string;

		/** Callback when mobile detail panel opens */
		onMobileDetailOpen?: MobileDetailOpenHandler<RowType>;
	};

	let {
		table,
		loading = false,
		error = null,
		emptyMessage,
		emptyTitle,
		showIndex = false,
		showSelection,
		showExpand = false,
		showPagination = true,
		onRowClick,
		onRowHover,
		rowClass,
		isRowSelectable,
		getDisabledSelectionReason,
		activeRowId,
		tabs,
		toolbar,
		selection,
		footer,
		totalRows,
		showColumnVisibility = false,
		showWideModeToggle = false,
		isWideMode = false,
		onWideModeChange,
		showExport = false,
		exportFilename = 'export',
		empty,
		cells,
		cellComponents,
		headers,
		virtualize = false,
		rowHeight = 40,
		overscan = 5,
		noPadding = false,
		bordered = false,
		rounded = true,
		class: className = '',
		disableMobileDetail = false,
		mobileDetailContent,
		mobileDetailTitle,
		onMobileDetailOpen
	}: Props = $props();

	// Layout measurement state
	let containerWidth = $state(0);
	let tabsContainerWidth = $state(0);
	let tabsWidth = $state(0);
	let actionsWidth = $state(0);
	let tabsContainerEl = $state<HTMLElement | null>(null);
	let tabsScrollWidth = $state(0);
	let tabsClientWidth = $state(0);

	// Scroll container ref for virtualization
	let scrollContainerRef = $state<HTMLElement | null>(null);

	// Mobile detection (600px breakpoint)
	const MOBILE_BREAKPOINT = 600;
	const isMobile = $derived(containerWidth > 0 && containerWidth < MOBILE_BREAKPOINT);

	// Mobile detail panel state
	let mobileDetailRow = $state<RowType | null>(null);

	/**
	 * Handle mobile row tap - opens the detail panel
	 */
	function handleMobileRowTap(row: RowType) {
		mobileDetailRow = row;
		onMobileDetailOpen?.(row);
	}

	/**
	 * Close the mobile detail panel
	 */
	function closeMobileDetail() {
		mobileDetailRow = null;
	}

	// Stack if content + safety gap (40px) exceeds container
	const shouldStack = $derived(tabsWidth + actionsWidth + 40 > containerWidth);
	const tabsOverflowing = $derived(tabsScrollWidth > tabsClientWidth);

	$effect(() => {
		// Track actual scroll metrics so we react as soon as a scrollbar appears
		tabsClientWidth = tabsContainerEl?.clientWidth ?? 0;
		tabsScrollWidth = tabsContainerEl?.scrollWidth ?? 0;
		// Re-run when tabs content or container size changes
		void tabsWidth;
		void tabsContainerWidth;
	});

	type ReactiveTable<T> = Table<T> & { track?: () => void };
	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	const trackTable = () => {
		reactiveTable.track?.();
		return reactiveTable;
	};

	// Get rows from the table model (already sorted/filtered/paginated by TanStack)
	const rows = $derived.by(() => {
		trackTable();
		return reactiveTable.getRowModel().rows;
	});
	const hasData = $derived(rows.length > 0);

	const selectionVisible = $derived(showSelection ?? !!reactiveTable.options.enableRowSelection);
	const showWideToggle = $derived(showWideModeToggle && !isMobile);
	const hasChrome = $derived(
		!!tabs || !!toolbar || !!selection || showColumnVisibility || showExport || showWideToggle
	);
	const hasActions = $derived(
		!!toolbar || !!selection || showColumnVisibility || showExport || showWideToggle
	);

	// Pagination info (used by DataTableBody for row indexing)
	const currentPage = $derived.by(() => {
		trackTable();
		return reactiveTable.getState().pagination.pageIndex;
	});
	const pageSize = $derived.by(() => {
		trackTable();
		return reactiveTable.getState().pagination.pageSize;
	});

	// Column span for empty/loading states
	const visibleLeafColumnsCount = $derived.by(() => {
		trackTable();
		return reactiveTable.getVisibleLeafColumns().length;
	});
	const colSpan = $derived(
		visibleLeafColumnsCount +
			(selectionVisible ? 1 : 0) +
			(showExpand ? 1 : 0) +
			(showIndex ? 1 : 0)
	);

	// Column resizing support: calculate table width from column sizes
	// Performance: This derived recalculates on table state changes, but the
	// calculation is O(n) where n = column count (typically 10-20). The DOM
	// only updates when the actual width value changes.
	const isResizingEnabled = $derived(!!reactiveTable.options.enableColumnResizing);
	const tableWidth = $derived.by(() => {
		if (!isResizingEnabled) return undefined;
		trackTable();
		// Sum all visible column widths (including special columns)
		let total = 0;
		if (selectionVisible) total += 36; // Checkbox column
		if (showExpand) total += 40; // Expand column
		if (showIndex) total += 48; // Index column
		// Add visible leaf column widths
		for (const col of reactiveTable.getVisibleLeafColumns()) {
			total += col.getSize();
		}
		return total;
	});

	// Get all column definitions for the mobile detail panel
	const allColumnDefs = $derived.by(() => {
		trackTable();
		return reactiveTable.getAllColumns().map((c) => c.columnDef);
	});
</script>

<div class="data-table-wrapper {className}" class:no-padding={noPadding}>
	<!-- Card container with internal scrolling -->
	<div class="data-table-card" class:bordered class:not-rounded={!rounded}>
		{#if hasChrome}
			<div
				class="data-table-chrome"
				class:has-tabs={!!tabs}
				class:is-stacked={shouldStack}
				class:has-tabs-scroll={tabsOverflowing}
				bind:clientWidth={containerWidth}
			>
				<div class="chrome-tabs" bind:clientWidth={tabsContainerWidth} bind:this={tabsContainerEl}>
					{#if tabs}
						<div class="chrome-tabs-inner" bind:clientWidth={tabsWidth}>
							{@render tabs()}
						</div>
					{/if}
				</div>
				{#if hasActions}
					<div class="chrome-actions">
						<div class="chrome-actions-inner" bind:clientWidth={actionsWidth}>
							{#if selection}
								<div class="chrome-selection">
									{@render selection()}
								</div>
							{/if}
							<div class="chrome-buttons">
								<!-- User-provided toolbar first (filter, etc.) -->
								{#if toolbar}
									{@render toolbar()}
								{/if}
								<!-- Built-in buttons after (columns, export) -->
								{#if showWideToggle}
									<IconButton
										tooltip={isWideMode
											? m.table_wide_mode_restore()
											: m.table_wide_mode_maximize()}
										onclick={() => onWideModeChange?.(!isWideMode)}
										isActive={isWideMode}
										ariaPressed={isWideMode}
									>
										<Icon><ViewportWide /></Icon>
									</IconButton>
								{/if}
								{#if showColumnVisibility}
									<DataTableColumnVisibility {table} />
								{/if}
								{#if showExport}
									<DataTableExportButton {table} filename={exportFilename} />
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		{/if}
		<div class="data-table-scroll-area" bind:this={scrollContainerRef}>
			<table
				class="data-table"
				class:table-fixed={isResizingEnabled}
				style:width={tableWidth ? `${tableWidth}px` : undefined}
			>
				<DataTableHeader
					{table}
					{showIndex}
					showSelection={selectionVisible}
					{showExpand}
					{headers}
				/>
				{#if loading}
					<tbody>
						<tr>
							<td colspan={colSpan} class="state-cell">
								<DataTableEmpty variant="loading" />
							</td>
						</tr>
					</tbody>
				{:else if error}
					<tbody>
						<tr>
							<td colspan={colSpan} class="state-cell">
								<DataTableEmpty variant="error" message={error} />
							</td>
						</tr>
					</tbody>
				{:else if !hasData}
					<tbody>
						<tr>
							<td colspan={colSpan} class="state-cell">
								{#if empty}
									{@render empty()}
								{:else}
									<DataTableEmpty variant="empty" title={emptyTitle} message={emptyMessage} />
								{/if}
							</td>
						</tr>
					</tbody>
				{:else if virtualize}
					<DataTableVirtualBody
						{table}
						{scrollContainerRef}
						{rowHeight}
						{overscan}
						{showIndex}
						showSelection={selectionVisible}
						{showExpand}
						{onRowClick}
						{rowClass}
						{currentPage}
						{pageSize}
						{isRowSelectable}
						{getDisabledSelectionReason}
						{activeRowId}
						{cells}
						{cellComponents}
						{isMobile}
						onMobileRowTap={disableMobileDetail ? undefined : handleMobileRowTap}
					/>
				{:else}
					<DataTableBody
						{table}
						{showIndex}
						showSelection={selectionVisible}
						{showExpand}
						{onRowClick}
						{onRowHover}
						{rowClass}
						{currentPage}
						{pageSize}
						{isRowSelectable}
						{getDisabledSelectionReason}
						{activeRowId}
						{cells}
						{cellComponents}
						{isMobile}
						onMobileRowTap={disableMobileDetail ? undefined : handleMobileRowTap}
					/>
				{/if}
			</table>
		</div>
		<DataTableFooter {table} {totalRows} {showPagination}>
			{#if footer}
				{@render footer()}
			{/if}
		</DataTableFooter>
	</div>
</div>

<!-- Mobile detail panel - shows all row data when tapping a row on mobile -->
{#if mobileDetailRow && !disableMobileDetail}
	<DataTableMobileDetail
		row={mobileDetailRow}
		columns={allColumnDefs}
		{cells}
		title={mobileDetailTitle}
		customContent={mobileDetailContent}
		onClose={closeMobileDetail}
	/>
{/if}

<style>
	.data-table-wrapper {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: var(--spacing-4); /* Add outer padding for visual gutter */
	}

	@media (max-width: 767px) {
		.data-table-wrapper {
			padding: 0;
		}
	}

	.data-table-wrapper.no-padding {
		padding: 0;
	}

	/* Card container — enables @container queries for child elements */
	.data-table-card {
		container-type: inline-size;
		flex: 1;
		min-height: 0;
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		/* overflow: hidden; Removed to allow dropdowns to overflow */
		display: flex;
		flex-direction: column;
		position: relative; /* Ensure z-index context */
	}

	.data-table-card.bordered {
		border: var(--border-width-thin) solid var(--border-muted);
	}

	.data-table-card.not-rounded {
		border-radius: 0;
	}

	.data-table-card.not-rounded .data-table-chrome {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	.data-table-chrome {
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		gap: var(--spacing-2);
		padding: 0 var(--spacing-3);
		min-height: 52px;
		background: var(--surface-secondary);
		border-top-left-radius: var(--radius-lg);
		border-top-right-radius: var(--radius-lg);
	}

	.data-table-chrome.is-stacked {
		flex-direction: column;
		height: auto;
		padding: 0;
		background: var(--surface-primary); /* Keep actions on card color */
		gap: 0; /* Remove horizontal gap when stacked so tabs join chrome cleanly */
	}

	.chrome-tabs {
		display: flex;
		align-items: flex-end; /* Align tabs to bottom */
		gap: var(--spacing-2);
		flex-shrink: 0;
		overflow: hidden;
	}

	.data-table-chrome.is-stacked .chrome-tabs {
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		background: var(--surface-secondary);
		border-top-left-radius: var(--radius-lg);
		border-top-right-radius: var(--radius-lg);
		padding-top: var(--spacing-2);
		padding-left: var(--spacing-3);
		padding-right: var(--spacing-3);
		padding-bottom: 0;
		/* Hide scrollbar — users swipe to scroll, scrollbar breaks visual continuity */
		scrollbar-width: none; /* Firefox */
	}

	.data-table-chrome.is-stacked .chrome-tabs::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
	}

	/* Ensure the active tab remains card-colored while the tab bar is secondary */
	.data-table-chrome.is-stacked .chrome-tabs :global([role='tab'][aria-selected='true']),
	.data-table-chrome .chrome-tabs :global(button[aria-selected='true']) {
		background: var(--surface-primary);
	}

	.chrome-actions {
		display: flex;
		align-items: center;
		margin-left: auto;
		flex-shrink: 0;
		min-width: 0; /* Allow shrinking if needed, though we try to stack */
	}

	.chrome-actions-inner {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		width: max-content;
	}

	.data-table-chrome.is-stacked .chrome-actions {
		width: 100%;
		margin-left: 0;
		justify-content: center;
		padding: var(--spacing-2);
		background: var(--surface-primary);
	}

	.chrome-selection {
		display: flex;
		align-items: center;
		padding-right: var(--spacing-2);
		border-right: 1px solid var(--border-primary);
	}

	.data-table-chrome.is-stacked .chrome-selection {
		border-right: none;
		padding-right: 0;
		margin-right: var(--spacing-2);
		border-right: 1px solid var(--border-primary); /* Keep border in stacked mode too? User said no top border. */
	}
	/* Actually selection border is vertical, likely fine to keep. */

	.chrome-buttons {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	/* Responsive: On narrower screens, stack tabs and actions vertically */
	/* Replaced by .is-stacked logic above */

	/* Scroll area inside the card */
	.data-table-scroll-area {
		width: 100%;
		padding: 0;
		flex: 1;
		min-height: 0;
		overflow-x: auto;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		/* Footer handles bottom border radius when present */
	}

	/* Mobile: horizontal scroll enabled for full table access */

	.data-table {
		--data-table-row-min-height: 40px;
		width: max-content;
		min-width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		font-size: var(--font-size-base);
		user-select: none;
		-webkit-user-select: none;
	}

	/* Fixed table layout for column resizing - allows columns to be resized
	   smaller than their content, with text truncating via ellipsis */
	.data-table.table-fixed {
		table-layout: fixed;
		width: auto; /* Override max-content; actual width set via inline style */
		min-width: 0; /* Allow fixed-width tables to be narrower than container */
	}

	.state-cell {
		padding: 0;
		border-bottom: none;
	}
</style>
