<!--
@component
PageHeader - The main header bar for app pages.
Displays breadcrumb navigation, page title, optional sidebar toggle, mobile hamburger, and action buttons.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Menu from '$lib/components/icons/Menu.svelte';
	import SidebarToggle from '$lib/components/icons/SidebarToggle.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';
	import BellRinging from '$lib/components/icons/BellRinging.svelte';
	import { appSidebarStore } from '$lib/stores/app-shell/appSidebarStore.svelte';
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import { notificationsStore } from '$lib/stores/notificationsStore.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { showSidebarToggle = true }: { showSidebarToggle?: boolean } = $props();

	const isSidebarExpanded = $derived(appSidebarStore.state.state === 'expanded');
	const isMobile = $derived(appSidebarStore.state.isMobile);

	// Read from store
	const title = $derived(pageHeaderStore.state.title);
	const breadcrumbs = $derived(pageHeaderStore.state.breadcrumbs);
	const actionsSnippet = $derived(pageHeaderStore.state.actionsSnippet);
	const currentPath = $derived($page.url.pathname);
	const unreadCount = $derived(notificationsStore.unreadCount);

	// Derived breadcrumb parts
	const hasBreadcrumbs = $derived(breadcrumbs.length > 0);
	const leaf = $derived(breadcrumbs[breadcrumbs.length - 1]);
	const parents = $derived(breadcrumbs.slice(0, -1));
	const isNotificationsPage = $derived(currentPath.startsWith('/notifications'));
	const unreadBadgeLabel = $derived(unreadCount > 0 ? formatBadgeCount(unreadCount) : null);
	const notificationAriaLabel = $derived(
		unreadCount > 0
			? `${m.nav_notifications()} (${unreadCount} ${m.notifications_unread_label()})`
			: m.nav_notifications()
	);

	function formatBadgeCount(count: number) {
		if (count > 99) return '99+';
		return count.toString();
	}

	function handleCrumbSelect(cb: (() => void) | undefined) {
		cb?.();
	}

	function handleNotificationsClick() {
		goto('/notifications');
	}

	onMount(() => {
		void notificationsStore.loadPage(0);
	});
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

		{#if hasBreadcrumbs}
			<nav class="breadcrumb" aria-label="Breadcrumb">
				<ol>
					{#each parents as crumb, i (i)}
						<li class="crumb parent">
							{#if crumb.onSelect}
								<button type="button" onclick={() => handleCrumbSelect(crumb.onSelect)}>
									{crumb.label}
								</button>
							{:else}
								<span>{crumb.label}</span>
							{/if}
						</li>
						<span class="sep" aria-hidden="true">
							<Icon size="small"><ChevronRight /></Icon>
						</span>
					{/each}
					<li class="crumb leaf">
						<h1 id="page-title" aria-current="page">{leaf?.label || title}</h1>
					</li>
				</ol>
			</nav>
		{:else}
			<h1 id="page-title">{title}</h1>
		{/if}
	</div>

	<div class="header-right">
		{#if actionsSnippet}
			{@render actionsSnippet()}
		{/if}
		<div class="header-notification">
			<IconButton
				tooltip={m.nav_notifications()}
				aria-label={notificationAriaLabel}
				isActive={isNotificationsPage}
				onclick={handleNotificationsClick}
			>
				<Icon><BellRinging /></Icon>
			</IconButton>
			{#if unreadBadgeLabel}
				<span class="notification-badge" aria-hidden="true">{unreadBadgeLabel}</span>
			{/if}
		</div>
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
		box-shadow: var(--shadow-base);
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

	.header-notification {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.notification-badge {
		position: absolute;
		top: -2px;
		right: -4px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-size: 10px;
		font-weight: var(--font-weight-bold);
		line-height: 1;
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		box-sizing: border-box;
	}

	#page-title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Breadcrumb styles */
	.breadcrumb {
		min-width: 0;
		overflow: hidden;
	}

	.breadcrumb ol {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 0;
		margin: 0;
		list-style: none;
		white-space: nowrap;
	}

	.crumb {
		display: flex;
		align-items: center;
	}

	.crumb button {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		color: var(--text-muted);
		cursor: pointer;
	}

	.crumb button:hover {
		color: var(--text-normal);
	}

	.crumb span {
		color: var(--text-muted);
	}

	.sep {
		color: var(--text-faint);
		margin: 0 var(--spacing-1);
		display: inline-flex;
		align-items: center;
	}

	.leaf h1 {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		margin: 0;
	}
</style>
