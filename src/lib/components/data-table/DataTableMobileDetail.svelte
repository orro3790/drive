<!--
@component DataTableMobileDetail
A slide-up modal panel that displays all row data in a mobile-friendly card layout.
Used by DataTable when a row is tapped on mobile devices (<600px).

Supports two modes:
1. Default: Auto-generates a detail list from column definitions
2. Custom: Renders a custom snippet for full control over content

@example Default mode
```svelte
<DataTableMobileDetail
  row={mobileDetailRow}
  columns={columns}
  cells={cells}
  onClose={() => mobileDetailRow = null}
/>
```

@example Custom content mode
```svelte
<DataTableMobileDetail
  row={mobileDetailRow}
  title="Driver Details"
  customContent={driverDetailSnippet}
  onClose={() => mobileDetailRow = null}
/>
```
-->
<script lang="ts" generics="RowType">
	import * as m from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import type { CellSnippets } from './types';
	import { onMount } from 'svelte';
	import { portal } from '$lib/actions/portal';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';

	type Props = {
		/** The row data to display */
		row: RowType;
		/** Column definitions for labels and accessors (used in default mode) */
		columns?: ColumnDef<RowType>[];
		/** Optional custom cell snippets for rendering values (used in default mode) */
		cells?: CellSnippets<RowType>;
		/** Custom title for the panel (defaults to "Details") */
		title?: string;
		/** Custom content snippet - when provided, replaces the default column list */
		customContent?: Snippet<[RowType]>;
		/** Callback when panel should close */
		onClose: () => void;
	};

	let { row, columns = [], cells, title, customContent, onClose }: Props = $props();

	let isBackdropPointerDown = false;

	// Escape key handling
	onMount(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	});

	function handleBackdropPointerDown(e: PointerEvent) {
		isBackdropPointerDown = e.target === e.currentTarget;
	}

	function handleBackdropPointerUp(e: PointerEvent) {
		if (isBackdropPointerDown && e.target === e.currentTarget) {
			onClose();
		}
		isBackdropPointerDown = false;
	}

	/**
	 * Get the header text from a column definition
	 */
	function getColumnHeader(column: ColumnDef<RowType>): string {
		if (typeof column.header === 'string') {
			return column.header;
		}
		// For function headers, use the column ID as fallback
		return column.id ?? '';
	}

	/**
	 * Get the value for a column from the row data
	 */
	function getColumnValue(column: ColumnDef<RowType>): unknown {
		if ('accessorFn' in column && typeof column.accessorFn === 'function') {
			return column.accessorFn(row, 0);
		}
		if ('accessorKey' in column && typeof column.accessorKey === 'string') {
			return (row as Record<string, unknown>)[column.accessorKey];
		}
		return null;
	}

	/**
	 * Format a value for display
	 */
	function formatValue(value: unknown): string {
		if (value == null) return '—';
		if (value instanceof Date) return value.toLocaleDateString();
		if (typeof value === 'number') return value.toLocaleString();
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (Array.isArray(value)) return value.length > 0 ? `${value.length} items` : '—';
		return String(value);
	}

	/**
	 * Filter columns to display - exclude internal columns like __index
	 */
	const displayColumns = $derived(
		columns.filter((col) => {
			const id = col.id ?? '';
			// Skip internal columns
			if (id.startsWith('__')) return false;
			// Skip columns without headers (likely action columns)
			if (!col.header) return false;
			return true;
		})
	);
</script>

<div
	class="mobile-detail-backdrop"
	use:portal
	role="dialog"
	aria-modal="true"
	aria-labelledby="mobile-detail-title"
	tabindex="-1"
	onpointerdown={handleBackdropPointerDown}
	onpointerup={handleBackdropPointerUp}
	onpointercancel={() => (isBackdropPointerDown = false)}
>
	<div class="mobile-detail-container">
		<header class="mobile-detail-header">
			<h2 id="mobile-detail-title">{title ?? m.table_mobile_detail_title()}</h2>
			<IconButton onclick={onClose} tooltip={m.common_close()}>
				<Icon><XIcon /></Icon>
			</IconButton>
		</header>

		<div class="mobile-detail-body">
			{#if customContent}
				{@render customContent(row)}
			{:else}
				<dl class="detail-list">
					{#each displayColumns as column (column.id)}
						{@const header = getColumnHeader(column)}
						{@const value = getColumnValue(column)}
						{@const cellSnippet = column.id ? cells?.[column.id] : undefined}
						<div class="detail-item">
							<dt class="detail-label">{header}</dt>
							<dd class="detail-value">
								{#if cellSnippet}
									{@render cellSnippet(row)}
								{:else}
									{formatValue(value)}
								{/if}
							</dd>
						</div>
					{/each}
				</dl>
			{/if}
		</div>
	</div>
</div>

<style>
	.mobile-detail-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		background: var(--overlay-backdrop);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		animation: fadeIn 150ms ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.mobile-detail-container {
		background: var(--surface-primary);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: var(--shadow-lg);
		width: 100%;
		max-width: 600px;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: slideUp 200ms ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(100%);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.mobile-detail-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-3) var(--spacing-4);
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		flex-shrink: 0;
	}

	.mobile-detail-header h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.mobile-detail-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-4);
		-webkit-overflow-scrolling: touch;
	}

	.detail-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		margin: 0;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.detail-label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
		letter-spacing: var(--letter-spacing-sm);
	}

	.detail-value {
		font-size: var(--font-size-base);
		color: var(--text-normal);
		margin: 0;
		word-break: break-word;
	}
</style>
