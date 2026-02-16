<!--
	Manager Layout

	Provides the app shell for manager-only pages.
	Role guard is enforced in +layout.server.ts.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppSidebar from '$lib/components/app-shell/AppSidebar.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="app-shell">
	<AppSidebar role="manager" />
	<div class="main-area">
		<PageHeader showUnfilledWindowsButton={true} />
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
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
		/* Safe area padding for native platforms (Android edge-to-edge / iOS notch) */
		padding-bottom: var(--safe-area-bottom);
	}
</style>
