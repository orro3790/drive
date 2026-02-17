<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
	import { getDomTheme } from '$lib/utils/theme';
	import AppVersionGate from '$lib/components/app-shell/AppVersionGate.svelte';

	let { children } = $props();

	/**
	 * Set status bar icon style based on current theme.
	 * DARK = dark icons (for light backgrounds)
	 * LIGHT = light icons (for dark backgrounds)
	 */
	async function syncStatusBarStyle() {
		const theme = getDomTheme() ?? 'dark';
		const style = theme === 'dark' ? SystemBarsStyle.Light : SystemBarsStyle.Dark;
		await SystemBars.setStyle({ style });
	}

	onMount(() => {
		if (!Capacitor.isNativePlatform()) {
			return;
		}

		// Flag enables CSS minimum safe area values for native platforms.
		document.documentElement.dataset.native = 'true';

		// Set status bar icon color based on theme
		void syncStatusBarStyle();

		// Watch for theme changes
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.attributeName === 'data-theme') {
					void syncStatusBarStyle();
				}
			}
		});
		observer.observe(document.documentElement, { attributes: true });

		return () => observer.disconnect();
	});
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
