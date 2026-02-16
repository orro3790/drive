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

		// Flag enables CSS minimum safe area values for native platforms.
		// Capacitor's SystemBars plugin (insetsHandling: 'css') injects
		// --safe-area-inset-* CSS variables with actual system bar heights.
		document.documentElement.dataset.native = 'true';
	});
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
