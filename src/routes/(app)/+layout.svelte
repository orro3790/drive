<!--
	App Layout

	Provides the app shell for shared pages accessible to any authenticated user.
	Auth guard is enforced in +layout.server.ts.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from '$lib/components/app-shell/AppSidebar.svelte';
	import OfflineBanner from '$lib/components/app-shell/OfflineBanner.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Determine role from user data
	const role = $derived((data.user?.role as 'driver' | 'manager') ?? 'driver');
</script>

<div class="app-shell">
	<AppSidebar {role} />
	<div class="main-area">
		<PageHeader />
		<OfflineBanner />
		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		height: 100vh;
		background: var(--surface-inset);
		overflow: hidden;
	}

	.main-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.content {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
</style>
