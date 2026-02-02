<!--
@component CellActions
Container for action buttons in a table cell.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Action buttons to render */
		children: Snippet;
	};

	let { children }: Props = $props();
</script>

<div
	class="cell-actions"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.stopPropagation()}
	role="presentation"
>
	{@render children()}
</div>

<style>
	.cell-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
	}
</style>
