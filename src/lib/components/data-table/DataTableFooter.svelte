<!--
@component DataTableFooter
A fixed-height footer that always displays row counts and pagination.
Prevents layout shift by maintaining consistent height regardless of selection state.

@example
```svelte
<DataTableFooter
  {table}
  totalRows={1234}
  showPagination={true}
/>
```
-->
<script lang="ts" generics="RowType">
	import * as m from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import type { Table } from '@tanstack/table-core';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import ChevronFirst from '$lib/components/icons/ChevronFirst.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';
	import ChevronLast from '$lib/components/icons/ChevronLast.svelte';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		/** The TanStack Table instance */
		table: Table<RowType>;
		/** Total row count before filtering (from server or data source) */
		totalRows?: number;
		/** Whether to show pagination controls */
		showPagination?: boolean;
		/** Custom content to render (e.g., selection info) */
		children?: Snippet;
	};

	let { table, totalRows, showPagination = true, children }: Props = $props();

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	// Track table state for reactivity
	const trackTable = () => {
		reactiveTable.track?.();
		return reactiveTable;
	};

	// Row counts
	const filteredRowCount = $derived.by(() => {
		trackTable();
		return reactiveTable.getFilteredRowModel().rows.length;
	});

	// Use provided totalRows or fall back to pre-filtered count
	const totalRowCount = $derived(totalRows ?? filteredRowCount);

	// Pagination info
	const pageIndex = $derived.by(() => {
		trackTable();
		return reactiveTable.getState().pagination.pageIndex;
	});

	const pageSize = $derived.by(() => {
		trackTable();
		return reactiveTable.getState().pagination.pageSize;
	});

	const pageCount = $derived.by(() => {
		trackTable();
		return reactiveTable.getPageCount();
	});

	const canPreviousPage = $derived.by(() => {
		trackTable();
		return reactiveTable.getCanPreviousPage();
	});

	const canNextPage = $derived.by(() => {
		trackTable();
		return reactiveTable.getCanNextPage();
	});

	// Calculate "Showing X–Y of Z"
	const rangeStart = $derived(pageIndex * pageSize + 1);
	const rangeEnd = $derived(Math.min((pageIndex + 1) * pageSize, filteredRowCount));

	// Determine if filters are active (filtered count differs from total)
	const isFiltered = $derived(totalRows !== undefined && filteredRowCount < totalRows);

	// Format the row count display
	const rowCountText = $derived.by(() => {
		if (filteredRowCount === 0) {
			return m.table_footer_no_results();
		}

		const start = rangeStart.toLocaleString();
		const end = rangeEnd.toLocaleString();
		const total = filteredRowCount.toLocaleString();
		const absoluteTotal = totalRowCount.toLocaleString();

		const range = m.table_footer_showing_range({ start, end });

		if (isFiltered) {
			return `${range} ${m.table_footer_of_results({ total })} ${m.table_footer_filtered_from({ total: absoluteTotal })}`;
		}

		return `${range} ${m.table_footer_of_results({ total })}`;
	});

	// Pagination handlers
	function goToFirstPage() {
		table.firstPage();
	}

	function goToPreviousPage() {
		table.previousPage();
	}

	function goToNextPage() {
		table.nextPage();
	}

	function goToLastPage() {
		table.lastPage();
	}
</script>

<div class="data-table-footer" role="contentinfo" aria-label={m.table_footer_aria_label()}>
	<div class="footer-left">
		<span class="row-count">{rowCountText}</span>
	</div>

	<div class="footer-center">
		{#if children}
			{@render children()}
		{/if}
	</div>

	<div class="footer-right">
		{#if showPagination && pageCount > 1}
			<div class="pagination-controls">
				<div class="pagination-group">
					<IconButton
						tooltip={m.table_footer_first_page()}
						onclick={goToFirstPage}
						disabled={!canPreviousPage}
						aria-label={m.table_footer_first_page()}
					>
						<Icon><ChevronFirst /></Icon>
					</IconButton>

					<IconButton
						tooltip={m.table_footer_previous_page()}
						onclick={goToPreviousPage}
						disabled={!canPreviousPage}
						aria-label={m.table_footer_previous_page()}
					>
						<Icon><ChevronLeft /></Icon>
					</IconButton>
				</div>

				<span class="page-indicator">
					{m.table_footer_page_indicator({
						current: (pageIndex + 1).toString(),
						total: pageCount.toLocaleString()
					})}
				</span>

				<div class="pagination-group">
					<IconButton
						tooltip={m.table_footer_next_page()}
						onclick={goToNextPage}
						disabled={!canNextPage}
						aria-label={m.table_footer_next_page()}
					>
						<Icon><ChevronRight /></Icon>
					</IconButton>

					<IconButton
						tooltip={m.table_footer_last_page()}
						onclick={goToLastPage}
						disabled={!canNextPage}
						aria-label={m.table_footer_last_page()}
					>
						<Icon><ChevronLast /></Icon>
					</IconButton>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.data-table-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-3);
		padding: 0 var(--spacing-3);
		background: var(--surface-secondary);
		min-height: 45px;
		border-top: var(--border-width-thin) solid var(--border-primary);
		border-bottom-left-radius: var(--radius-lg);
		border-bottom-right-radius: var(--radius-lg);
		font-size: var(--font-size-sm);
	}

	.footer-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		color: var(--text-normal);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	.footer-center {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-width: 0;
	}

	.footer-right {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-shrink: 0;
	}

	.row-count {
		color: var(--text-normal);
		font-weight: var(--font-weight-medium);
		/* Align text with 28px buttons */
		display: flex;
		align-items: center;
		height: 28px;
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.pagination-group {
		display: flex;
		align-items: center;
	}

	.page-indicator {
		color: var(--text-normal);
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		min-width: 8ch;
		text-align: center;
		/* Align text with 28px buttons */
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: normal;
	}

	/* Responsive: Stack on narrow screens */
	@media (max-width: 600px) {
		.data-table-footer {
			flex-wrap: wrap;
			gap: var(--spacing-2);
			min-height: auto;
			padding: 0 var(--spacing-3);
		}

		.footer-left {
			order: 2;
			width: 100%;
			justify-content: center;
		}

		.footer-center {
			order: 1;
			width: 100%;
		}

		.footer-right {
			order: 3;
			width: 100%;
			justify-content: center;
		}

		.page-indicator {
			display: none;
		}
	}
</style>
