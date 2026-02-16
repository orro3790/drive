<!--
	App Layout

	Provides the app shell for shared pages accessible to any authenticated user.
	Auth guard is enforced in +layout.server.ts.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import AppSidebar from '$lib/components/app-shell/AppSidebar.svelte';
	import OfflineBanner from '$lib/components/app-shell/OfflineBanner.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';
	import NotificationPermissionCard from '$lib/components/driver/NotificationPermissionCard.svelte';
	import { initPushNotifications } from '$lib/utils/pushNotifications';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Determine role from user data
	const role = $derived((data.user?.role as 'driver' | 'manager') ?? 'driver');

	// Initialize push notifications on native platforms
	// Only completes registration if already granted - won't prompt user
	onMount(() => {
		void initPushNotifications();
	});
</script>

<div class="app-shell">
	<AppSidebar {role} />
	<div class="main-area">
		<PageHeader
			showUnfilledWindowsButton={role === 'manager'}
			showUnconfirmedShiftsButton={role === 'driver'}
			showOpenBidsButton={role === 'driver'}
		/>
		<OfflineBanner />
		<NotificationPermissionCard />
		<main class="content" data-scroll-root>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		height: 100vh;
		height: 100dvh;
		background: var(--surface-inset);
		overflow: hidden;
	}

	.main-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding-bottom: var(--safe-area-bottom);
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
	}
</style>
