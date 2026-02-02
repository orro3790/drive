<script lang="ts">
	let { stroke = 'currentColor' } = $props<{
		stroke?: string;
	}>();
</script>

<!-- src/lib/icons/Menu.svelte -->
<svg
	class="icon"
	viewBox="0 0 24 24"
	fill="none"
	{stroke}
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<path d="M4 6h16M4 12h16M4 18h16" />
</svg>
