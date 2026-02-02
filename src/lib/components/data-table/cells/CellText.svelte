<!--
@component CellText
Simple text cell renderer with optional secondary text.
-->
<script lang="ts">
	type Props = {
		/** Primary text to display */
		value: string | null | undefined;
		/** Optional secondary/description text */
		secondary?: string | null;
		/** Whether to truncate text with ellipsis */
		truncate?: boolean;
		/** Max width for truncation */
		maxWidth?: string;
	};

	let { value, secondary, truncate = false, maxWidth = '300px' }: Props = $props();

	const displayValue = $derived(value ?? '—');
</script>

<div class="cell-text" class:truncate>
	<span class="primary" style:max-width={truncate ? maxWidth : undefined}>{displayValue}</span>
	{#if secondary}
		<span class="secondary" style:max-width={truncate ? maxWidth : undefined}>{secondary}</span>
	{/if}
</div>

<style>
	.cell-text {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-half);
	}

	.primary {
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.secondary {
		color: var(--text-normal);
	}

	.truncate .primary,
	.truncate .secondary {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
