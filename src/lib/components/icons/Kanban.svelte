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
	<!-- Three columns representing kanban board -->
	<rect x="3" y="3" width="5" height="18" rx="1" />
	<rect x="9.5" y="3" width="5" height="12" rx="1" />
	<rect x="16" y="3" width="5" height="8" rx="1" />
</svg>
