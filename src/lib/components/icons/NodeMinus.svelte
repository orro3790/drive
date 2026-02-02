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
	><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path
		d="M12.5 21h-7.5a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10"
	/><path d="M16 19h6" /></svg
>
