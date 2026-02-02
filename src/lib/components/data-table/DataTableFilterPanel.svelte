<!--
@component DataTableFilterPanel
A comprehensive filter panel that automatically renders appropriate filter UI
based on column metadata and TanStack's faceting data.

Replaces custom filter modals with integrated, reactive filtering.

@example
```svelte
<DataTableFilterPanel {table} />
```
-->
<script lang="ts" generics="RowType">
	import type { Table, Column } from '@tanstack/table-core';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import FilterPlus from '$lib/components/icons/FilterPlus.svelte';
	import DataTableFilterDropdown from './DataTableFilterDropdown.svelte';
	import DataTableFilterRange from './DataTableFilterRange.svelte';
	import type { FilterType } from './types';
	import * as m from '$lib/paraglide/messages';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		table: Table<RowType>;
		/** Label for the filter button */
		label?: string;
	};

	let { table, label }: Props = $props();

	const filterLabel = $derived(label ?? m.table_filter_label());

	let open = $state(false);
	let panelRef = $state<HTMLDivElement | null>(null);

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	// Get all filterable columns
	const filterableColumns = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getAllLeafColumns().filter((col) => col.getCanFilter());
	});

	// Get current column filters state
	const columnFilters = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnFilters;
	});

	// Count active filters
	const activeFilterCount = $derived(columnFilters.length);

	// Determine the filter type for a column
	function getFilterType(column: Column<RowType, unknown>): FilterType {
		// Check meta first
		const meta = column.columnDef.meta;
		if (meta?.filterType) return meta.filterType;

		// Infer from filter function
		const filterFn = column.columnDef.filterFn;
		if (filterFn === 'inNumberRange') return 'range';
		if (filterFn === 'equals' || filterFn === 'arrIncludes') return 'select';

		// Default to select for faceted columns
		return 'select';
	}

	function togglePanel() {
		open = !open;
	}

	function closePanel() {
		open = false;
	}

	function clearAllFilters() {
		reactiveTable.resetColumnFilters();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			closePanel();
		}
	}

	function handleOutsideClick(event: MouseEvent) {
		if (!open) return;
		if (panelRef && !panelRef.contains(event.target as Node)) {
			closePanel();
		}
	}

	onMount(() => {
		window.addEventListener('mousedown', handleOutsideClick);
		return () => window.removeEventListener('mousedown', handleOutsideClick);
	});
</script>

<div class="filter-panel-container">
	<IconButton
		ariaExpanded={open}
		aria-label={filterLabel}
		tooltip={activeFilterCount > 0
			? m.table_filter_tooltip_active({ count: activeFilterCount })
			: filterLabel}
		isActive={activeFilterCount > 0}
		ariaPressed={activeFilterCount > 0}
		onclick={togglePanel}
	>
		<Icon><FilterPlus /></Icon>
		{#if activeFilterCount > 0}
			<span class="filter-badge">{activeFilterCount}</span>
		{/if}
	</IconButton>

	{#if open}
		<div
			bind:this={panelRef}
			class="filter-panel"
			role="dialog"
			aria-label={m.table_filter_aria_label()}
			tabindex="-1"
			onkeydown={handleKeydown}
		>
			<div class="panel-header">
				<h3 class="panel-title">{m.table_filter_title()}</h3>
				{#if activeFilterCount > 0}
					<Button variant="ghost" size="small" onclick={clearAllFilters}>
						{m.table_filter_clear_all()}
					</Button>
				{/if}
			</div>

			{#if filterableColumns.length === 0}
				<div class="empty-state">{m.table_filter_no_columns()}</div>
			{:else}
				<div class="filter-groups">
					{#each filterableColumns as column (column.id)}
						{@const filterType = getFilterType(column)}
						<div class="filter-group">
							{#if filterType === 'range'}
								<DataTableFilterRange {column} {table} />
							{:else}
								<DataTableFilterDropdown {column} {table} />
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div class="panel-footer">
				<Button variant="secondary" fill size="small" onclick={closePanel}>{m.common_done()}</Button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	.filter-panel-container {
		position: relative;
	}

	.filter-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-size: 10px;
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.filter-panel {
		position: absolute;
		top: 110%;
		right: 0;
		width: 320px;
		max-height: 480px;
		overflow-y: auto;
		background: var(--surface-primary);
		border: var(--border-width-thin) solid var(--border-primary);
		border-radius: var(--radius-lg);
		/* Stronger shadow for better lift/contrast without borders */
		box-shadow: var(--shadow-xl);
		z-index: 30;
		display: flex;
		flex-direction: column;
		/* Animation similar to Modal */
		animation: scaleIn 150ms ease-out;
		transform-origin: top right;
	}

	@keyframes scaleIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-3);
		position: sticky;
		top: 0;
		background: var(--surface-primary);
		z-index: 1;
		min-height: 56px; /* Prevent layout shift when button appears */
		box-sizing: border-box;
	}

	.panel-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		margin: 0;
	}

	.filter-groups {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		padding: 0 var(--spacing-3) 0 var(--spacing-3);
	}

	.filter-group {
		/* No border separators, just spacing */
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.filter-group:last-child {
		padding-bottom: 0;
	}

	.panel-footer {
		display: flex;
		justify-content: flex-end;
		padding: var(--spacing-3);
		/* No top border, just spacing */
		position: sticky;
		bottom: 0;
		background: var(--surface-primary);
	}

	.empty-state {
		padding: var(--spacing-5);
		text-align: center;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	/* Responsive: Make panel full-width on mobile */
	@media (max-width: 480px) {
		.filter-panel {
			position: fixed;
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			width: 100%;
			max-height: 70vh;
			border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		}
	}
</style>
