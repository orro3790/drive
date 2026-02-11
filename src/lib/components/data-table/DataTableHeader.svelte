<!--
@component DataTableHeader
Renders the table header with sortable column headers.

Sorting follows a 3-click cycle:
- Click 1: A-Z / ascending
- Click 2: Z-A / descending  
- Click 3: Remove sorting (original order)

Supports custom header snippets via the `headers` prop for rendering
rich header content (tooltips, icons, etc.) while maintaining sort functionality.
-->
<script lang="ts" generics="RowType">
	import * as m from '$lib/paraglide/messages.js';
	import type {
		Table,
		Header,
		SortingState,
		ColumnPinningState,
		Column
	} from '@tanstack/table-core';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import SortAsc from '$lib/components/icons/SortStringAscending.svelte';
	import SortDesc from '$lib/components/icons/SortStringDescending.svelte';
	import ArrowsSort from '$lib/components/icons/ArrowsSort.svelte';
	import GripVertical from '$lib/components/icons/GripVertical.svelte';
	import ContextMenu from '$lib/components/ContextMenu.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import Pin from '$lib/components/icons/Pin.svelte';
	import PinOff from '$lib/components/icons/PinOff.svelte';
	import type { HeaderSnippets } from './types';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		table: Table<RowType>;
		showIndex?: boolean;
		showSelection?: boolean;
		showExpand?: boolean;
		/** Custom header snippets - map column IDs to snippets with header context */
		headers?: HeaderSnippets;
		/** Show an empty filler column at the end to absorb remaining width */
		showFiller?: boolean;
	};

	let {
		table,
		showIndex = false,
		showSelection = false,
		showExpand = false,
		headers,
		showFiller = false
	}: Props = $props();

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	const headerGroups = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getHeaderGroups();
	});

	// Derive sorting state from table state to ensure reactivity
	const sortingState = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().sorting as SortingState;
	});

	// Derive selection state from table state
	const selectionState = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().rowSelection as Record<string, boolean>;
	});

	// Derive column visibility state for reactivity
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

	// Derive column pinning state for reactivity
	const columnPinning = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnPinning as ColumnPinningState;
	});

	// Simple key so header rendering responds to pin/unpin
	const columnPinningKey = $derived(
		`${(columnPinning.left ?? []).join(',')}|${(columnPinning.right ?? []).join(',')}`
	);

	// Derive column sizing state for reactivity
	const columnSizing = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnSizing as Record<string, number>;
	});

	// Context menu state for column pinning
	let contextMenuOpen = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let contextMenuColumn = $state<Column<RowType, unknown> | null>(null);

	// Mobile detection for disabling pinning
	let isMobile = $state(false);

	$effect(() => {
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		isMobile = mediaQuery.matches;
		const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mediaQuery.addEventListener('change', handler);
		return () => mediaQuery.removeEventListener('change', handler);
	});

	function handleColumnContextMenu(event: MouseEvent, column: Column<RowType, unknown>) {
		// Only show context menu if pinning is enabled and not on mobile
		if (!table.options.enableColumnPinning || isMobile) return;

		event.preventDefault();
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
		contextMenuColumn = column;
		contextMenuOpen = true;
	}

	function closeContextMenu() {
		contextMenuOpen = false;
		contextMenuColumn = null;
	}

	function pinColumnLeft() {
		if (contextMenuColumn) {
			contextMenuColumn.pin('left');
		}
		closeContextMenu();
	}

	function pinColumnRight() {
		if (contextMenuColumn) {
			contextMenuColumn.pin('right');
		}
		closeContextMenu();
	}

	function unpinColumn() {
		if (contextMenuColumn) {
			contextMenuColumn.pin(false);
		}
		closeContextMenu();
	}

	// Get pinned offset for a column
	function getPinnedOffset(header: Header<RowType, unknown>): number | undefined {
		const pinned = header.column.getIsPinned();
		if (!pinned) return undefined;

		if (pinned === 'left') {
			return header.column.getStart('left');
		}
		if (pinned === 'right') {
			return header.column.getAfter('right');
		}
		return undefined;
	}

	const selectionEnabled = $derived(showSelection && !!table.getToggleAllRowsSelectedHandler);

	// Compute selection status from derived state
	const allRowsSelected = $derived.by(() => {
		reactiveTable.track?.();
		const rows = reactiveTable.getRowModel().rows;
		if (rows.length === 0) return false;
		return rows.every((row) => selectionState[row.id]);
	});

	const someRowsSelected = $derived.by(() => {
		return Object.values(selectionState).some(Boolean);
	});

	const hasSelectableRows = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getRowModel().rows.some((row) => row.getCanSelect?.() ?? true);
	});

	/**
	 * Get sort direction for a column from derived sorting state
	 */
	function getSortDirection(columnId: string): 'asc' | 'desc' | false {
		const sortItem = sortingState.find((s) => s.id === columnId);
		if (!sortItem) return false;
		return sortItem.desc ? 'desc' : 'asc';
	}

	function getAriaSort(
		sortDirection: 'asc' | 'desc' | false,
		canSort: boolean
	): 'ascending' | 'descending' | 'none' | undefined {
		if (!canSort) return undefined;
		if (sortDirection === 'asc') return 'ascending';
		if (sortDirection === 'desc') return 'descending';
		return 'none';
	}

	/**
	 * Handle sort click with 3-state cycle: none → asc → desc → none
	 */
	function handleSort(header: Header<RowType, unknown>) {
		if (!header.column.getCanSort()) return;

		const currentSort = getSortDirection(header.column.id);

		if (currentSort === false) {
			// Not sorted → sort ascending
			header.column.toggleSorting(false);
		} else if (currentSort === 'asc') {
			// Ascending → sort descending
			header.column.toggleSorting(true);
		} else {
			// Descending → clear sorting
			header.column.clearSorting();
		}
	}

	function getHeaderContent(header: Header<RowType, unknown>): string {
		const columnDef = header.column.columnDef;
		if (typeof columnDef.header === 'string') {
			return columnDef.header;
		}
		return header.column.id;
	}

	function getColumnMeta(header: Header<RowType, unknown>) {
		return header.column.columnDef.meta ?? {};
	}

	function handleResizeKey(event: KeyboardEvent, header: Header<RowType, unknown>) {
		if (!table.options.enableColumnResizing) return;
		const column = header.column;
		const current = column.getSize();
		const step = event.shiftKey ? 50 : 10; // Shift for larger steps
		const meta = getColumnMeta(header);
		const minSize = column.columnDef.minSize ?? meta.minWidth ?? 50;
		const maxSize = column.columnDef.maxSize ?? meta.maxWidth ?? 500;

		let newSize: number | null = null;

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			newSize = Math.min(maxSize, current + step);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			newSize = Math.max(minSize, current - step);
		} else if (event.key === 'Home') {
			event.preventDefault();
			newSize = minSize;
		} else if (event.key === 'End') {
			event.preventDefault();
			newSize = maxSize;
		}

		if (newSize !== null) {
			// Use table.setColumnSizing to update column size (no column.setSize API)
			table.setColumnSizing((old) => ({
				...old,
				[column.id]: newSize
			}));
		}
	}

	/**
	 * Reset a single column to its default size (remove from columnSizing state)
	 */
	function resetColumnSize(header: Header<RowType, unknown>) {
		const column = header.column;
		table.setColumnSizing((old) => {
			const next = {
				...old
			};
			delete next[column.id];
			return next;
		});
	}

	/**
	 * Independent resize: dragging the handle resizes only the column it belongs to.
	 */
	function columnResizeHandler(header: Header<RowType, unknown>) {
		return (event: MouseEvent | TouchEvent) => {
			event.preventDefault();
			const startX = 'touches' in event ? event.touches[0].clientX : event.clientX;
			const column = header.column;
			const initialSize = column.getSize();
			const minSize = column.columnDef.minSize ?? 50;

			const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
				const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
				const delta = Math.max(-(initialSize - minSize), currentX - startX);

				table.setColumnSizing((old) => ({
					...old,
					[column.id]: initialSize + delta
				}));
			};

			const handleUp = () => {
				document.removeEventListener('mousemove', handleMove);
				document.removeEventListener('mouseup', handleUp);
				document.removeEventListener('touchmove', handleMove);
				document.removeEventListener('touchend', handleUp);
			};

			document.addEventListener('mousemove', handleMove);
			document.addEventListener('mouseup', handleUp);
			document.addEventListener('touchmove', handleMove);
			document.addEventListener('touchend', handleUp);
		};
	}
</script>

<thead>
	{#each headerGroups as headerGroup (`${headerGroup.id}-${visibleColumnsKey}`)}
		<tr>
			{#if selectionEnabled}
				<th class="col-select">
					<div class="checkbox-header">
						<Checkbox
							checked={allRowsSelected}
							indeterminate={someRowsSelected && !allRowsSelected}
							ariaLabel={m.table_header_select_all()}
							disabled={!hasSelectableRows}
							onclick={(event) => event.stopPropagation()}
							onchange={table.getToggleAllRowsSelectedHandler()}
						/>
					</div>
				</th>
			{/if}
			{#if showExpand}
				<th class="col-expand"></th>
			{/if}
			{#if showIndex}
				<th class="col-index">
					<div class="static-header">#</div>
				</th>
			{/if}
			{#each headerGroup.headers as header (`${header.id}-${getSortDirection(header.column.id)}-${columnPinningKey}`)}
				{@const meta = getColumnMeta(header)}
				{@const sortDir = getSortDirection(header.column.id)}
				{@const canSort = header.column.getCanSort()}
				{@const isResizingEnabled = table.options.enableColumnResizing}
				{@const pinnedPosition = header.column.getIsPinned()}
				{@const pinnedOffset = getPinnedOffset(header)}
				{@const dynamicWidth = isResizingEnabled
					? (columnSizing[header.column.id] ?? header.column.getSize())
					: undefined}
				{@const pinnedLabel = pinnedPosition
					? m.table_header_pinned({ position: pinnedPosition })
					: null}
				{@const customHeaderSnippet = headers?.[header.column.id]}
				{@const headerContext = {
					columnId: header.column.id,
					headerText: getHeaderContent(header),
					canSort,
					sortDirection: sortDir
				}}
				<th
					class="data-table-th"
					aria-sort={getAriaSort(sortDir, canSort)}
					class:sortable={canSort}
					class:sorted={sortDir !== false}
					class:sticky-left={meta.stickyLeft || pinnedPosition === 'left'}
					class:pinned-left={pinnedPosition === 'left'}
					class:pinned-right={pinnedPosition === 'right'}
					class:align-left={meta.align === 'left' || !meta.align}
					class:align-center={meta.align === 'center' || meta.align === 'separator'}
					class:align-right={meta.align === 'right'}
					class:sizing-hug={meta.sizing === 'hug' || !meta.sizing}
					class:sizing-fill={meta.sizing === 'fill' && dynamicWidth === undefined}
					class:sizing-fixed={meta.sizing === 'fixed' || dynamicWidth !== undefined}
					class:resizable={isResizingEnabled}
					style:width={dynamicWidth !== undefined
						? `${dynamicWidth}px`
						: meta.sizing === 'fixed' && meta.width
							? `${meta.width}px`
							: undefined}
					style:min-width={!isResizingEnabled && meta.minWidth ? `${meta.minWidth}px` : undefined}
					style:max-width={!isResizingEnabled && meta.maxWidth ? `${meta.maxWidth}px` : undefined}
					style:left={pinnedPosition === 'left' && pinnedOffset !== undefined
						? `${pinnedOffset}px`
						: undefined}
					style:right={pinnedPosition === 'right' && pinnedOffset !== undefined
						? `${pinnedOffset}px`
						: undefined}
					oncontextmenu={(e) => handleColumnContextMenu(e, header.column)}
				>
					{#if customHeaderSnippet}
						<!-- Custom header snippet with full context -->
						{#if canSort}
							<button
								type="button"
								class="sort-header"
								onclick={() => handleSort(header)}
								aria-label={m.table_header_sort_by({ column: getHeaderContent(header) })}
							>
								{@render customHeaderSnippet(headerContext)}
								{#if pinnedPosition}
									<span
										class="pin-indicator"
										role="img"
										aria-label={pinnedLabel}
										title={pinnedLabel}
									>
										<Icon><Pin /></Icon>
									</span>
								{/if}
								<span class="sort-icon" class:active={sortDir !== false}>
									{#if sortDir === 'asc'}
										<Icon><SortAsc /></Icon>
									{:else if sortDir === 'desc'}
										<Icon><SortDesc /></Icon>
									{:else}
										<Icon><ArrowsSort /></Icon>
									{/if}
								</span>
							</button>
						{:else}
							<div class="static-header">
								{@render customHeaderSnippet(headerContext)}
								{#if pinnedPosition}
									<span
										class="pin-indicator"
										role="img"
										aria-label={pinnedLabel}
										title={pinnedLabel}
									>
										<Icon><Pin /></Icon>
									</span>
								{/if}
							</div>
						{/if}
					{:else if canSort}
						<button
							type="button"
							class="sort-header"
							onclick={() => handleSort(header)}
							aria-label={m.table_header_sort_by({ column: getHeaderContent(header) })}
						>
							<span class="header-label">{getHeaderContent(header)}</span>
							{#if pinnedPosition}
								<span class="pin-indicator" role="img" aria-label={pinnedLabel} title={pinnedLabel}>
									<Icon><Pin /></Icon>
								</span>
							{/if}
							<span class="sort-icon" class:active={sortDir !== false}>
								{#if sortDir === 'asc'}
									<Icon><SortAsc /></Icon>
								{:else if sortDir === 'desc'}
									<Icon><SortDesc /></Icon>
								{:else}
									<Icon><ArrowsSort /></Icon>
								{/if}
							</span>
						</button>
					{:else}
						<div class="static-header">
							<span class="header-text">{getHeaderContent(header)}</span>
							{#if pinnedPosition}
								<span class="pin-indicator" role="img" aria-label={pinnedLabel} title={pinnedLabel}>
									<Icon><Pin /></Icon>
								</span>
							{/if}
						</div>
					{/if}
					{#if isResizingEnabled}
						<button
							type="button"
							class="resize-handle"
							class:is-resizing={header.column.getIsResizing()}
							aria-label={m.table_header_resize_label({
								column: getHeaderContent(header),
								width: header.column.getSize().toString()
							})}
							onclick={(event) => event.stopPropagation()}
							ondblclick={(event) => {
								event.stopPropagation();
								resetColumnSize(header);
							}}
							onmousedown={columnResizeHandler(header)}
							ontouchstart={columnResizeHandler(header)}
							onkeydown={(event) => handleResizeKey(event, header)}
						>
							<span class="resize-icon"><GripVertical /></span>
						</button>
					{/if}
				</th>
			{/each}
			{#if showFiller}
				<th class="col-filler"></th>
			{/if}
		</tr>
	{/each}
</thead>

{#if contextMenuOpen && contextMenuColumn}
	{@const isPinned = contextMenuColumn.getIsPinned()}
	<ContextMenu x={contextMenuX} y={contextMenuY} closeMenu={closeContextMenu}>
		{#if isPinned}
			<MenuItem label={m.table_header_unpin()} onclick={unpinColumn}>
				{#snippet icon()}<Icon><PinOff /></Icon>{/snippet}
			</MenuItem>
		{:else}
			<MenuItem label={m.table_header_pin_left()} onclick={pinColumnLeft}>
				{#snippet icon()}<Icon><Pin /></Icon>{/snippet}
			</MenuItem>
			<MenuItem label={m.table_header_pin_right()} onclick={pinColumnRight}>
				{#snippet icon()}<Icon><Pin /></Icon>{/snippet}
			</MenuItem>
		{/if}
	</ContextMenu>
{/if}

<style>
	thead {
		position: sticky;
		top: 0;
		z-index: 3;
	}

	.data-table-th {
		height: var(--data-table-row-min-height, 40px);
		padding: 0;
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		white-space: nowrap;
		text-align: left;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		position: relative;
		box-sizing: border-box;
		overflow: hidden;
	}

	/* Index column */
	.col-index {
		width: 48px;
		min-width: 48px;
		max-width: 48px;
		height: var(--data-table-row-min-height, 40px);
		padding: 0;
		color: var(--text-normal);
		font-weight: var(--font-weight-medium);
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		text-transform: uppercase;
	}

	.col-index .static-header {
		justify-content: center;
		padding: 0;
		width: 100%;
	}

	.col-select {
		width: 36px;
		min-width: 36px;
		max-width: 36px;
		height: var(--data-table-row-min-height, 40px);
		padding: 0;
		text-align: center;
		vertical-align: middle;
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		vertical-align: middle;
		box-sizing: border-box;
	}

	.col-expand {
		width: 40px;
		min-width: 40px;
		max-width: 40px;
		height: var(--data-table-row-min-height, 40px);
		text-align: center;
		vertical-align: middle;
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		box-sizing: border-box;
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

	/* Sizing */
	.sizing-fill {
		width: 100%;
	}

	/* Pinned columns (left/right) - disabled on mobile for better horizontal scroll UX */
	@media (min-width: 768px) {
		.pinned-left,
		.pinned-right {
			position: sticky;
			z-index: 20;
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

		/* Legacy sticky left support */
		.sticky-left:not(.pinned-left):not(.pinned-right) {
			position: sticky;
			left: 0;
			z-index: 20;
		}
	}

	/* Sortable header button and static header alignment container */
	.sort-header,
	.static-header,
	.checkbox-header {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		min-width: 0;
		width: 100%;
		max-width: 100%;
		height: 100%; /* Ensure they fill the th height for consistent vertical centering */
		padding: 0 var(--spacing-3);
		box-sizing: border-box;
	}

	.static-header {
		overflow: hidden;
	}

	.checkbox-header {
		justify-content: center;
		padding: 0;
		width: 100%;
	}

	.sort-header {
		background: transparent;
		border: none;
		cursor: pointer;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		overflow: hidden;
	}

	.sort-header:hover {
		color: var(--interactive-accent);
	}

	.sort-header:hover .sort-icon {
		opacity: 1;
	}

	/* Sort icon styling */
	.sort-icon {
		opacity: 0.3;
		transition: opacity var(--transition-all);
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.sort-icon.active {
		opacity: 1;
		color: var(--interactive-accent);
	}

	.pin-indicator {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: var(--spacing-1);
		color: var(--interactive-accent);
		opacity: 0.9;
		flex-shrink: 0;
	}

	@media (max-width: 767px) {
		.pin-indicator {
			display: none;
		}
	}

	.pin-indicator :global(svg) {
		width: 16px;
		height: 16px;
	}

	.header-text,
	.header-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: inline-block;
		max-width: 100%;
		font-size: var(--font-size-sm);
	}

	.header-text {
		font-weight: var(--font-weight-medium);
	}

	/* Match alignment for container contents */
	.align-center .sort-header,
	.align-center .static-header {
		justify-content: center;
	}

	.align-right .sort-header,
	.align-right .static-header {
		justify-content: flex-end;
	}

	.resize-handle {
		position: absolute;
		top: 0;
		right: -6px;
		height: 100%;
		width: 14px;
		cursor: col-resize;
		touch-action: none;
		user-select: none;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		padding: 0;
		z-index: 25; /* Above pinned columns (z-index: 20) to ensure visibility */
		color: var(--text-faint);
		opacity: 0.5;
		transition:
			opacity 0.15s ease,
			color 0.15s ease;
	}

	.resize-handle:hover {
		opacity: 1;
		color: var(--interactive-accent);
	}

	.resize-handle:focus-visible {
		outline: none;
		opacity: 1;
		color: var(--interactive-accent);
	}

	.resize-handle.is-resizing {
		opacity: 1;
		color: var(--interactive-accent);
	}

	/* Allow resize handle to extend past column boundary */
	.resizable {
		overflow: visible; /* Allow resize handle to extend past column boundary */
	}

	.resize-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 12px;
	}

	.resize-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	.col-filler {
		width: auto;
		padding: 0;
		background: var(--surface-primary);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
	}
</style>
