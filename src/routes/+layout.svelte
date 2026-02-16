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

		const root = document.documentElement;
		root.dataset.native = 'true';
		const viewport = window.visualViewport;

		function updateInsets() {
			if (!viewport) {
				return;
			}

			// Best-effort measurement for Android edge-to-edge where system bars overlay the WebView.
			const top = Math.max(0, Math.round(viewport.offsetTop));
			const bottom = Math.max(
				0,
				Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
			);

			root.style.setProperty('--safe-area-top', `${top}px`);
			root.style.setProperty('--safe-area-bottom', `${bottom}px`);
		}

		updateInsets();
		viewport?.addEventListener('resize', updateInsets);
		viewport?.addEventListener('scroll', updateInsets);
		window.addEventListener('resize', updateInsets);

		return () => {
			viewport?.removeEventListener('resize', updateInsets);
			viewport?.removeEventListener('scroll', updateInsets);
			window.removeEventListener('resize', updateInsets);
		};
	});
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
