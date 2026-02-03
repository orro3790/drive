<!--
@component
SettingsGrid - Container for settings rows with consistent spacing.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type SettingsGridProps = {
		children?: Snippet;
	};

	let { children }: SettingsGridProps = $props();
</script>

<div class="settings-grid">
	{@render children?.()}
</div>

<style>
	.settings-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0;
	}

	.settings-grid :global(.setting-row:last-of-type) {
		border-bottom: none;
	}
</style>
