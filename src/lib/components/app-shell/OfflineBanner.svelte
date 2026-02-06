<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';

	let isOnline = $state(true);

	async function registerServiceWorker() {
		if (!('serviceWorker' in navigator)) {
			return;
		}

		try {
			await navigator.serviceWorker.register(`${base}/service-worker.js`);
		} catch {
			// Registration failures should not break navigation
		}
	}

	async function refreshOfflineCache() {
		if (!('serviceWorker' in navigator)) {
			return;
		}

		try {
			const registration = await navigator.serviceWorker.ready;
			registration.active?.postMessage({ type: 'drive:refresh-offline-cache' });
		} catch {
			// Ignore refresh failures; stale data remains available
		}
	}

	onMount(() => {
		isOnline = navigator.onLine;
		void registerServiceWorker();

		const handleOnline = () => {
			isOnline = true;
			void refreshOfflineCache();
		};

		const handleOffline = () => {
			isOnline = false;
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if !isOnline}
	<div class="offline-banner-shell">
		<NoticeBanner variant="warning" align="start">
			<p>{m.offline_banner_message()}</p>
		</NoticeBanner>
	</div>
{/if}

<style>
	.offline-banner-shell {
		padding: var(--spacing-3) var(--spacing-3) 0;
	}

	.offline-banner-shell p {
		margin: 0;
	}
</style>
