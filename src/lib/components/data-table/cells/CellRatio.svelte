<!--
@component CellRatio
Cell renderer for ratio/dimension values, centered on separator.
Examples: "1 : 3", "24 x 24", "1 / 5"
-->
<script lang="ts">
	type Props = {
		/** Left value */
		left: string | number | null | undefined;
		/** Right value */
		right: string | number | null | undefined;
		/** Separator character */
		separator?: string;
		/** Placeholder for empty values */
		placeholder?: string;
	};

	let { left, right, separator = ':', placeholder = '—' }: Props = $props();

	const hasValues = $derived(left != null && right != null);
</script>

{#if hasValues}
	<div class="cell-ratio">
		<span class="left">{left}</span>
		<span class="separator">{separator}</span>
		<span class="right">{right}</span>
	</div>
{:else}
	<span class="empty">{placeholder}</span>
{/if}

<style>
	.cell-ratio {
		display: inline-grid;
		grid-template-columns: 1fr auto 1fr;
		gap: var(--spacing-1);
		align-items: center;
		font-variant-numeric: tabular-nums;
	}

	.left {
		text-align: right;
	}

	.separator {
		color: var(--text-muted);
		text-align: center;
	}

	.right {
		text-align: left;
	}

	.empty {
		color: var(--text-faint);
	}
</style>
