<!--
@component DataTableFilterDropdown
A dropdown filter for categorical data columns using TanStack's faceting API.

Shows unique values with counts, auto-computed from table data.

@example
```svelte
<DataTableFilterDropdown {column} />
```
-->
<script lang="ts" generics="RowType">
	import type { Column, Table } from '@tanstack/table-core';
	import Button from '$lib/components/primitives/Button.svelte';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import * as m from '$lib/paraglide/messages';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		column: Column<RowType, unknown>;
		table: Table<RowType>;
	};

	let { column, table }: Props = $props();

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	// Get unique values with counts from TanStack's faceting
	const uniqueValues = $derived.by(() => {
		reactiveTable.track?.();
		const faceted = column.getFacetedUniqueValues();

		// Check if we're dealing with array values (e.g. tags, classes)
		// We check the first non-null value to determine the type
		let isArrayColumn = false;
		for (const key of faceted.keys()) {
			if (key != null) {
				if (Array.isArray(key)) isArrayColumn = true;
				break;
			}
		}

		if (isArrayColumn) {
			// Flatten array values and aggregate counts
			const counts = new Map<unknown, number>();
			for (const [key, count] of faceted.entries()) {
				if (Array.isArray(key)) {
					for (const item of key) {
						if (item != null && item !== '') {
							counts.set(item, (counts.get(item) || 0) + count);
						}
					}
				}
			}
			return [...counts.entries()].sort((a, b) => {
				if (b[1] !== a[1]) return b[1] - a[1];
				return String(a[0]).localeCompare(String(b[0]));
			});
		}

		// Standard behavior for scalar values
		// Filter out undefined/null values and sort by count descending, then alphabetically
		return [...faceted.entries()]
			.filter(([value]) => value != null && value !== '')
			.sort((a, b) => {
				if (b[1] !== a[1]) return b[1] - a[1]; // count desc
				return String(a[0]).localeCompare(String(b[0])); // alpha asc
			});
	});

	// Get current filter value(s)
	const currentFilter = $derived.by(() => {
		reactiveTable.track?.();
		return column.getFilterValue();
	});

	// Check if a value is selected (supports single value or array of values)
	function isSelected(value: unknown): boolean {
		if (currentFilter == null) return false;
		if (Array.isArray(currentFilter)) {
			return currentFilter.includes(value);
		}
		return currentFilter === value;
	}

	// Toggle a value in the filter
	function toggleValue(value: unknown) {
		const current = currentFilter;

		// If no current filter, set this as the only value
		if (current == null) {
			column.setFilterValue(value);
			return;
		}

		// If current is an array
		if (Array.isArray(current)) {
			const idx = current.indexOf(value);
			if (idx === -1) {
				// Add value
				column.setFilterValue([...current, value]);
			} else if (current.length === 1) {
				// Last value, clear filter
				column.setFilterValue(undefined);
			} else {
				// Remove value
				column.setFilterValue(current.filter((v) => v !== value));
			}
			return;
		}

		// If current is single value
		if (current === value) {
			// Deselect - clear filter
			column.setFilterValue(undefined);
		} else {
			// Add to make array
			column.setFilterValue([current, value]);
		}
	}

	// Clear all filter values
	function clearFilter() {
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

	// Count of active filters
	const activeCount = $derived(() => {
		if (currentFilter == null) return 0;
		if (Array.isArray(currentFilter)) return currentFilter.length;
		return 1;
	});
</script>

<div class="filter-dropdown">
	<div class="filter-header">
		<span class="filter-label">{label()}</span>
		<div class="header-actions">
			{#if activeCount() > 0}
				<Button variant="ghost" size="compact" onclick={clearFilter}>
					{m.table_filter_dropdown_clear({ count: activeCount() })}
				</Button>
			{/if}
		</div>
	</div>

	{#if uniqueValues.length === 0}
		<div class="empty-state">{m.table_filter_dropdown_no_values()}</div>
	{:else}
		<div class="filter-options" role="listbox" aria-multiselectable="true">
			{#each uniqueValues as [value, count] (`${column.id}-${value}`)}
				{@const selected = isSelected(value)}
				{@const displayValue = String(value)}
				<button
					type="button"
					class="filter-option"
					role="option"
					aria-selected={selected}
					onclick={() => toggleValue(value)}
				>
					<Checkbox
						checked={selected}
						onclick={(event) => {
							event.stopPropagation();
							toggleValue(value);
						}}
					/>
					<span class="option-label">{displayValue}</span>
					<span class="option-count">{count}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.filter-dropdown {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.filter-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-2);
		min-height: 28px; /* Maintain height to prevent layout shift */
	}

	.header-actions {
		min-height: 24px; /* Reserve space height */
	}

	.filter-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.filter-options {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		max-height: 200px;
		overflow-y: auto;
	}

	.filter-option {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
	}

	.filter-option:hover {
		background: var(--interactive-hover);
	}

	/* Removed .selected background style */

	.option-label {
		flex: 1;
		font-size: var(--font-size-base); /* Updated to base size */
		color: var(--text-normal);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.option-count {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.empty-state {
		padding: var(--spacing-3);
		text-align: center;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}
</style>
