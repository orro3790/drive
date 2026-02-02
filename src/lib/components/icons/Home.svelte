<script lang="ts">
	let { stroke = 'currentColor' } = $props<{
		stroke?: string;
	}>();
</script>

<!-- src/lib/icons/Home.svelte -->
<svg
	class="icon"
	viewBox="0 0 24 24"
	fill="none"
	{stroke}
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<path d="M5 12H3l9-9 9 9h-2" />
	<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
	<path d="M9 21v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6" />
</svg>
