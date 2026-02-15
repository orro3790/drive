<script lang="ts">
	import '../app.css';
	import AppVersionGate from '$lib/components/app-shell/AppVersionGate.svelte';

	let { children } = $props();
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
