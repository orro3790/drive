<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import AppVersionGate from '$lib/components/app-shell/AppVersionGate.svelte';

	let { children } = $props();

	onMount(() => {
		if (!Capacitor.isNativePlatform()) {
			return;
		}

		document.documentElement.dataset.native = 'true';
	});
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
