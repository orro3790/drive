<script lang="ts" generics="RowType">
	import * as m from '$lib/paraglide/messages.js';
	import type { Table } from '@tanstack/table-core';
	import { onMount } from 'svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import { exportTableToCsv, type ExportScope } from './utils/exportCsv';
	import CSV from '../icons/CSV.svelte';

	type ReactiveTable<T> = Table<T> & { track?: () => void };

	type Props = {
		table: Table<RowType>;
		filename?: string;
		excludeColumns?: string[];
		disabled?: boolean;
	};

	let {
		table,
		filename = 'export.csv',
		excludeColumns = ['select', 'actions'],
		disabled = false
	}: Props = $props();

	let open = $state(false);
	let containerRef = $state<HTMLDivElement | null>(null);

	const reactiveTable = $derived(table as ReactiveTable<RowType>);

	// Scope options with their labels and count getters
	const LARGE_DATASET_THRESHOLD = 10000;

	const selectedCount = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getSelectedRowModel().rows.length;
	});

	const pageCount = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getRowModel().rows.length;
	});

	const filteredCount = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getFilteredRowModel().rows.length;
	});

	const allCount = $derived.by(() => {
		reactiveTable.track?.();
		return reactiveTable.getCoreRowModel().rows.length;
	});

	const showLargeDatasetWarning = $derived(
		allCount > LARGE_DATASET_THRESHOLD || filteredCount > LARGE_DATASET_THRESHOLD
	);

	type ScopeOption = {
		scope: ExportScope;
		label: string;
		count: number;
		disabled: boolean;
		disabledReason?: string;
	};

	const scopeOptions = $derived<ScopeOption[]>([
		{
			scope: 'selected',
			label: m.table_export_scope_selected(),
			count: selectedCount,
			disabled: selectedCount === 0,
			disabledReason: m.table_export_no_selection()
		},
		{
			scope: 'page',
			label: m.table_export_scope_page(),
			count: pageCount,
			disabled: false
		},
		{
			scope: 'filtered',
			label: m.table_export_scope_filtered(),
			count: filteredCount,
			disabled: false
		},
		{
			scope: 'all',
			label: m.table_export_scope_all(),
			count: allCount,
			disabled: false
		}
	]);

	function togglePopover() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function handleExport(scope: ExportScope) {
		exportTableToCsv(table, {
			filename,
			scope,
			excludeColumns
		});
		close();
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
</script>

<div class="export-button-container" bind:this={containerRef}>
	<IconButton
		ariaExpanded={open}
		tooltip={m.table_export_csv()}
		aria-label={m.table_export_csv_aria_label()}
		{disabled}
		onclick={togglePopover}
	>
		<Icon><CSV /></Icon>
	</IconButton>

	{#if open}
		<div class="export-menu" role="menu" tabindex="-1" onkeydown={handleKeydown}>
			{#each scopeOptions as option (option.scope)}
				<button
					type="button"
					class="menu-item"
					role="menuitem"
					disabled={option.disabled}
					aria-label="{option.label}, {m.table_export_rows_count({ count: option.count })}"
					title={option.disabled ? option.disabledReason : undefined}
					onmousedown={(event) => event.stopPropagation()}
					onclick={() => handleExport(option.scope)}
				>
					<span class="label">{option.label}</span>
					<span class="count">{m.table_export_rows_count({ count: option.count })}</span>
				</button>
			{/each}
			{#if showLargeDatasetWarning}
				<div class="warning" role="alert">
					{m.table_export_large_dataset_warning()}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.export-button-container {
		position: relative;
	}

	.export-menu {
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
		justify-content: space-between;
		gap: var(--spacing-2);
		width: 100%;
		background: transparent;
		border: none;
		text-align: left;
		padding: var(--spacing-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.menu-item:hover:not(:disabled),
	.menu-item:focus-visible {
		background: var(--interactive-hover);
		outline: none;
	}

	.menu-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.label {
		color: var(--text-normal);
	}

	.count {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.warning {
		padding: var(--spacing-2);
		margin-top: var(--spacing-1);
		background: var(--surface-warning);
		border-radius: var(--radius-sm);
		color: var(--text-warning);
		font-size: var(--font-size-sm);
	}
</style>
