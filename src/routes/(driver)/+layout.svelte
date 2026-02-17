<!--
	Driver Layout

	Provides the app shell for driver-only pages.
	Role guard is enforced in +layout.server.ts.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import AppSidebar from '$lib/components/app-shell/AppSidebar.svelte';
	import OfflineBanner from '$lib/components/app-shell/OfflineBanner.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';

	let { children }: { children: Snippet } = $props();

	async function handleRefresh() {
		await invalidateAll();
	}
</script>

<div class="app-shell">
	<AppSidebar role="driver" />
	<div class="main-area">
		<PageHeader showUnconfirmedShiftsButton={true} showOpenBidsButton={true} />
		<OfflineBanner />
		<main class="content" data-scroll-root>
			<PullToRefresh onRefresh={handleRefresh}>
				{@render children()}
			</PullToRefresh>
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
		/* Safe area: shrink the content area so scroll container doesn't extend under nav bar */
		padding-bottom: var(--safe-area-bottom);
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-gutter: stable;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
	}
</style>
