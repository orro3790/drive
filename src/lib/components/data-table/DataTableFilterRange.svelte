<!--
@component DataTableFilterRange
A range filter for numeric data columns using TanStack's faceting API.

Auto-computes min/max from table data.

@example
```svelte
<DataTableFilterRange {column} {table} />
```
-->
<script lang="ts" generics="RowType">
	import type { Column, Table } from '@tanstack/table-core';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import * as m from '$lib/paraglide/messages';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		column: Column<RowType, unknown>;
		table: Table<RowType>;
	};

	let { column, table }: Props = $props();

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	// Get min/max from TanStack's faceting
	const minMax = $derived.by(() => {
		reactiveTable.track?.();
		return column.getFacetedMinMaxValues() ?? [0, 100];
	});

	const dataMin = $derived(minMax[0] ?? 0);
	const dataMax = $derived(minMax[1] ?? 100);

	// Current filter value as [min, max] tuple
	const currentFilter = $derived.by(() => {
		reactiveTable.track?.();
		const val = column.getFilterValue();
		if (Array.isArray(val) && val.length === 2) {
			return val as [number, number];
		}
		return undefined;
	});

	// Local state for inputs (allows typing without immediate filtering)
	let minInput = $state<string>('');
	let maxInput = $state<string>('');

	// Sync local state when filter changes externally
	$effect(() => {
		if (currentFilter) {
			minInput = currentFilter[0]?.toString() ?? '';
			maxInput = currentFilter[1]?.toString() ?? '';
		} else {
			minInput = '';
			maxInput = '';
		}
	});

	// Apply filter when inputs change (debounced via blur/enter)
	function applyFilter() {
		const min = minInput ? parseFloat(minInput) : undefined;
		const max = maxInput ? parseFloat(maxInput) : undefined;

		if (min === undefined && max === undefined) {
			column.setFilterValue(undefined);
		} else {
			column.setFilterValue([min ?? dataMin, max ?? dataMax]);
		}
	}

	function handleFocusOut() {
		applyFilter();
	}

	function clearFilter() {
		minInput = '';
		maxInput = '';
		column.setFilterValue(undefined);
	}

	// Display label for column
	const label = $derived(() => {
		const meta = column.columnDef.meta;
		if (meta?.filterLabel) return meta.filterLabel;
		const header = column.columnDef.header;
		if (typeof header === 'string') return header;
		return column.id;
	});

	const hasFilter = $derived(currentFilter != null);
</script>

<div class="filter-range">
	<div class="filter-header">
		<span class="filter-label">{label()}</span>
		{#if hasFilter}
			<button type="button" class="clear-btn" onclick={clearFilter}
				>{m.table_filter_range_clear()}</button
			>
		{/if}
	</div>

	<form
		class="range-inputs"
		role="group"
		onsubmit={(event) => {
			event.preventDefault();
			applyFilter();
		}}
		novalidate
	>
		<div class="input-group">
			<InlineEditor
				mode="form"
				inputType="number"
				value={minInput}
				placeholder={m.table_filter_range_min_placeholder({ min: dataMin })}
				onInput={(v) => {
					minInput = v;
				}}
				onblur={handleFocusOut}
				variant="bordered"
				size="small"
				ariaLabel={m.table_filter_range_min_aria_label({ label: label() })}
			/>
		</div>

		<span class="range-separator">–</span>

		<div class="input-group">
			<InlineEditor
				mode="form"
				inputType="number"
				value={maxInput}
				placeholder={m.table_filter_range_max_placeholder({ max: dataMax })}
				onInput={(v) => {
					maxInput = v;
				}}
				onblur={handleFocusOut}
				variant="bordered"
				size="small"
				ariaLabel={m.table_filter_range_max_aria_label({ label: label() })}
			/>
		</div>
	</form>
</div>

<style>
	.filter-range {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.filter-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-2);
	}

	.filter-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted); /* Updated to text-muted */
	}

	.clear-btn {
		background: transparent;
		border: none;
		font-size: var(--font-size-sm);
		color: var(--interactive-accent);
		cursor: pointer;
		padding: 0;
	}

	.clear-btn:hover {
		text-decoration: underline;
	}

	.range-inputs {
		display: flex;
		align-items: center; /* Vertically center items */
		gap: var(--spacing-2);
	}

	.input-group {
		flex: 1;
		min-width: 0; /* Prevents flex item from overflowing */
	}

	.range-separator {
		color: var(--text-muted);
		font-size: var(--font-size-base);
		padding: 0 var(--spacing-1);
	}
</style>
