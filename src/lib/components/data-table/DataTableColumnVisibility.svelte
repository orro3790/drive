<script lang="ts" generics="RowType">
	import * as m from '$lib/paraglide/messages.js';
	import type { Table } from '@tanstack/table-core';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import ColumnsIcon from '$lib/components/icons/Columns.svelte';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		table: Table<RowType>;
		label?: string;
	};

	let { table, label }: Props = $props();
	const displayLabel = $derived(label ?? m.table_columns_label());
	let open = $state(false);
	let containerRef = $state<HTMLDivElement | null>(null);

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	const hideableColumns = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getAllLeafColumns().filter((col) => col.getCanHide());
	});

	// Derive visibility state from table state to ensure reactivity
	const columnVisibility = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnVisibility as Record<string, boolean>;
	});

	// Check if a column is visible using derived state
	function isColumnVisible(columnId: string): boolean {
		// If not in visibility map, default to visible (true)
		return columnVisibility[columnId] !== false;
	}

	function toggleVisibility() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			close();
		}
	}

	function handleOutsideClick(event: MouseEvent) {
		if (!open) return;
		const target = event.target as Node;
		if (containerRef && containerRef.contains(target)) return;
		close();
	}

	onMount(() => {
		window.addEventListener('mousedown', handleOutsideClick);
		return () => window.removeEventListener('mousedown', handleOutsideClick);
	});

	function getColumnLabel(column: (typeof hideableColumns)[number]): string {
		const def = column.columnDef;
		if (def.meta && typeof def.meta === 'object' && 'exportHeader' in def.meta) {
			const header = (def.meta as Record<string, unknown>).exportHeader;
			if (typeof header === 'string') return header;
		}
		if (typeof def.header === 'string') return def.header;
		return column.id;
	}

	// Check if resizing is enabled
	const isResizingEnabled = $derived(!!table.options.enableColumnResizing);

	// Check if there are any custom column sizes
	const columnSizing = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getState().columnSizing as Record<string, number>;
	});

	const hasCustomSizes = $derived(Object.keys(columnSizing).length > 0);

	function resetAllColumnSizes() {
		table.resetColumnSizing();
	}
</script>

<div class="column-visibility" bind:this={containerRef}>
	<IconButton
		ariaExpanded={open}
		aria-label={displayLabel}
		tooltip={displayLabel}
		onclick={toggleVisibility}
	>
		<Icon><ColumnsIcon /></Icon>
	</IconButton>

	{#if open}
		<div class="column-menu" role="menu" tabindex="-1" onkeydown={handleKeydown}>
			{#if hideableColumns.length === 0}
				<div class="empty">{m.table_columns_no_hideable()}</div>
			{:else}
				{#each hideableColumns as column (`${column.id}-${columnVisibility[column.id] ?? true}`)}
					{@const visible = isColumnVisible(column.id)}
					<button
						type="button"
						class="menu-item"
						role="menuitemcheckbox"
						aria-checked={visible}
						onmousedown={(event) => event.stopPropagation()}
						onclick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							column.toggleVisibility();
						}}
					>
						<Checkbox
							checked={visible}
							onclick={(event) => {
								event.stopPropagation();
								column.toggleVisibility();
							}}
						/>
						<span class="label">{getColumnLabel(column)}</span>
					</button>
				{/each}
				{#if isResizingEnabled}
					<hr class="menu-divider" />
					<button
						type="button"
						class="menu-item reset-btn"
						disabled={!hasCustomSizes}
						onmousedown={(event) => event.stopPropagation()}
						onclick={resetAllColumnSizes}
					>
						<span class="label">{m.table_columns_reset_sizes()}</span>
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.column-visibility {
		position: relative;
	}

	.column-menu {
		position: absolute;
		top: 110%;
		right: 0;
		min-width: 220px;
		background: var(--surface-primary);
		border: var(--border-width-thin) solid var(--border-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--spacing-2);
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		width: 100%;
		background: transparent;
		border: none;
		text-align: left;
		padding: var(--spacing-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.menu-item:hover,
	.menu-item:focus-visible {
		background: var(--interactive-hover);
		outline: none;
	}

	.label {
		flex: 1;
		color: var(--text-normal);
	}

	.empty {
		padding: var(--spacing-2);
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.menu-divider {
		border: none;
		height: 1px;
		background: var(--border-primary);
		margin: var(--spacing-2) 0;
	}

	.reset-btn {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.reset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.reset-btn:not(:disabled):hover {
		color: var(--text-normal);
	}
</style>
