<script lang="ts">
	let { stroke = 'currentColor' } = $props<{
		stroke?: string;
	}>();
</script>

<svg
	class="icon"
	viewBox="0 0 24 24"
	fill="none"
	{stroke}
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<path d="M3 3v18h18" />
	<path d="M18.4 8l-4.3 3.2-3.7-3.2-4.4 4.2" />
</svg>
