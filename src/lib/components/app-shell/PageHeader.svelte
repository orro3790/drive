<!--
@component
PageHeader - The main header bar for app pages.
Displays page title, optional sidebar toggle, mobile hamburger, and action buttons.
-->
<script lang="ts">
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Menu from '$lib/components/icons/Menu.svelte';
	import SidebarToggle from '$lib/components/icons/SidebarToggle.svelte';
	import { appSidebarStore } from '$lib/stores/app-shell/appSidebarStore.svelte';
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { showSidebarToggle = true } = $props<{
		showSidebarToggle?: boolean;
	}>();

	const isSidebarExpanded = $derived(appSidebarStore.state.state === 'expanded');
	const isMobile = $derived(appSidebarStore.state.isMobile);

	// Read from store
	const title = $derived(pageHeaderStore.state.title);
	const actionsSnippet = $derived(pageHeaderStore.state.actionsSnippet);
</script>

<header class="page-header">
	<div class="header-left">
		<!-- Mobile: hamburger menu -->
		{#if isMobile}
			<IconButton
				tooltip={isSidebarExpanded ? m.sidebar_close() : m.sidebar_open()}
				aria-label={isSidebarExpanded ? m.sidebar_close() : m.sidebar_open()}
				onclick={() => appSidebarStore.toggle()}
			>
				<Icon><Menu /></Icon>
			</IconButton>
		{:else if showSidebarToggle}
			<!-- Desktop: sidebar toggle -->
			<IconButton
				tooltip={isSidebarExpanded ? m.sidebar_collapse() : m.sidebar_expand()}
				aria-label={isSidebarExpanded ? m.sidebar_collapse() : m.sidebar_expand()}
				onclick={() => appSidebarStore.toggle()}
			>
				<Icon><SidebarToggle /></Icon>
			</IconButton>
		{/if}

		<h1 id="page-title">{title}</h1>
	</div>

	<div class="header-right">
		{#if actionsSnippet}
			{@render actionsSnippet()}
		{/if}
	</div>
</header>

<style>
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-3);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--surface-primary);
		border-bottom: none;
		box-shadow: none;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		z-index: 2;
		position: relative;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		flex: 1;
		min-width: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	#page-title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
