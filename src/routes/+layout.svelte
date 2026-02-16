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

		const updateRuntimeInsets = () => {
			const viewport = window.visualViewport;
			if (!viewport) {
				return;
			}

			const runtimeTopInset = Math.max(0, Math.min(64, Math.round(viewport.offsetTop)));
			const runtimeBottomInset = Math.max(
				0,
				Math.min(80, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop)))
			);

			root.style.setProperty('--safe-area-top-runtime', `${runtimeTopInset}px`);
			root.style.setProperty('--safe-area-bottom-runtime', `${runtimeBottomInset}px`);
		};

		updateRuntimeInsets();
		window.addEventListener('resize', updateRuntimeInsets);
		window.visualViewport?.addEventListener('resize', updateRuntimeInsets);
		window.visualViewport?.addEventListener('scroll', updateRuntimeInsets);

		return () => {
			window.removeEventListener('resize', updateRuntimeInsets);
			window.visualViewport?.removeEventListener('resize', updateRuntimeInsets);
			window.visualViewport?.removeEventListener('scroll', updateRuntimeInsets);
		};
	});
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
