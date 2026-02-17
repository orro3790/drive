<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
	import { getDomTheme } from '$lib/utils/theme';
	import AppVersionGate from '$lib/components/app-shell/AppVersionGate.svelte';

	let { children } = $props();

	async function syncSystemBarStyle() {
		const theme = getDomTheme() ?? 'dark';
		const style = theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light;

		try {
			await Promise.all([
				SystemBars.setStyle({ style, bar: SystemBarType.StatusBar }),
				SystemBars.setStyle({ style, bar: SystemBarType.NavigationBar })
			]);
		} catch (error) {
			console.error('Failed to sync system bar style', { theme, style, error });
		}
	}

	onMount(() => {
		if (!Capacitor.isNativePlatform()) {
			return;
		}

		// Flag enables CSS minimum safe area values for native platforms.
		document.documentElement.dataset.native = 'true';

		void syncSystemBarStyle();
		setTimeout(() => {
			void syncSystemBarStyle();
		}, 250);

		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.attributeName === 'data-theme') {
					void syncSystemBarStyle();
				}
			}
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});

		return () => observer.disconnect();
	});
</script>

<AppVersionGate>
	{@render children()}
</AppVersionGate>
