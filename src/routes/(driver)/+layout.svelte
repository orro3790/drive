<!--
	Driver Layout

	Provides the app shell for driver-only pages.
	Role guard is enforced in +layout.server.ts.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from '$lib/components/app-shell/AppSidebar.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="app-shell">
	<AppSidebar role="driver" />
	<div class="main-area">
		<PageHeader />
		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100vh;
		background: var(--surface-inset);
	}

	.main-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.content {
		flex: 1;
		overflow-y: auto;
	}
</style>
