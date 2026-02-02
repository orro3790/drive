<!--
@component CellBadge
Badge/tag cell renderer for status or category labels.
-->
<script lang="ts">
	type Variant = 'default' | 'success' | 'warning' | 'error' | 'info';

	type Props = {
		/** Text to display in the badge */
		value: string | null | undefined;
		/** Visual variant for different states */
		variant?: Variant;
		/** Placeholder for empty values */
		placeholder?: string;
	};

	let { value, variant = 'default', placeholder = '—' }: Props = $props();

	const hasValue = $derived(value != null && value !== '');
</script>

{#if hasValue}
	<span class="cell-badge {variant}">{value}</span>
{:else}
	<span class="empty">{placeholder}</span>
{/if}

<style>
	.cell-badge {
		display: inline-block;
		padding: var(--spacing-half) var(--spacing-1-5);
		background: var(--interactive-hover);
		border-radius: var(--radius-sm);
		color: var(--text-normal);
		white-space: nowrap;
	}

	.cell-badge.success {
		background: var(--status-success-background);
		color: var(--status-success);
	}

	.cell-badge.warning {
		background: var(--status-warning-background);
		color: var(--status-warning);
	}

	.cell-badge.error {
		background: var(--status-error-background);
		color: var(--status-error);
	}

	.cell-badge.info {
		background: var(--status-info-background);
		color: var(--interactive-accent);
	}

	.empty {
		color: var(--text-faint);
	}
</style>
