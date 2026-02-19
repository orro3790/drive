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
	import CalendarExclamation from '$lib/components/icons/CalendarExclamation.svelte';
	import Gavel from '$lib/components/icons/Gavel.svelte';
	import { appSidebarStore } from '$lib/stores/app-shell/appSidebarStore.svelte';
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import { notificationsStore } from '$lib/stores/notificationsStore.svelte';
	import { routeStore } from '$lib/stores/routeStore.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let {
		showSidebarToggle = true,
		showUnfilledWindowsButton = false,
		showUnconfirmedShiftsButton = false,
		showOpenBidsButton = false
	}: {
		showSidebarToggle?: boolean;
		showUnfilledWindowsButton?: boolean;
		showUnconfirmedShiftsButton?: boolean;
		showOpenBidsButton?: boolean;
	} = $props();

	let unconfirmedShiftCount = $state(0);
	let openBidsCount = $state(0);

	const isSidebarExpanded = $derived(appSidebarStore.state.state === 'expanded');
	const isMobile = $derived(appSidebarStore.state.isMobile);

	// Read from store
	const title = $derived(pageHeaderStore.state.title);
	const breadcrumbs = $derived(pageHeaderStore.state.breadcrumbs);
	const actionsSnippet = $derived(pageHeaderStore.state.actionsSnippet);
	const currentPath = $derived($page.url.pathname);
	const unreadCount = $derived(notificationsStore.unreadCount);
	const hasEmergencyNotifications = $derived(notificationsStore.emergencyUnreadCount > 0);
	const unfilledRouteCount = $derived.by(() => {
		if (!showUnfilledWindowsButton) {
			return 0;
		}
		return routeStore.routes.filter(
			(route) => route.status === 'unfilled' || route.status === 'bidding'
		).length;
	});
	const unfilledRouteBadgeLabel = $derived(
		unfilledRouteCount > 0 ? formatBadgeCount(unfilledRouteCount) : null
	);
	const unfilledAriaLabel = $derived(
		unfilledRouteCount > 0
			? `${m.manager_attention_unfilled()} (${unfilledRouteCount})`
			: m.manager_attention_unfilled()
	);
	const unconfirmedShiftBadgeLabel = $derived(
		unconfirmedShiftCount > 0 ? formatBadgeCount(unconfirmedShiftCount) : null
	);
	const unconfirmedShiftAriaLabel = $derived(
		unconfirmedShiftCount > 0
			? `${m.dashboard_confirm_section()} (${unconfirmedShiftCount})`
			: m.dashboard_confirm_section()
	);
	const openBidsBadgeLabel = $derived(openBidsCount > 0 ? formatBadgeCount(openBidsCount) : null);
	const openBidsAriaLabel = $derived(
		openBidsCount > 0
			? `${m.bids_available_section()} (${openBidsCount})`
			: m.bids_available_section()
	);

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

	function handleUnfilledWindowsClick() {
		goto('/routes?tab=unfilled');
	}

	function handleUnconfirmedShiftsClick() {
		goto('/dashboard#needs-confirmation');
	}

	function handleOpenBidsClick() {
		goto('/bids#available-bids');
	}

	async function loadUnconfirmedShiftCount() {
		try {
			const response = await fetch('/api/dashboard');
			if (!response.ok) {
				return;
			}

			const payload = (await response.json()) as {
				unconfirmedShifts?: Array<{ isConfirmable?: boolean }>;
			};

			const unconfirmed = Array.isArray(payload.unconfirmedShifts)
				? payload.unconfirmedShifts.filter((shift) => shift?.isConfirmable === true).length
				: 0;

			unconfirmedShiftCount = unconfirmed;
		} catch {
			unconfirmedShiftCount = 0;
		}
	}

	async function loadOpenBidsCount() {
		try {
			const response = await fetch('/api/bids/available');
			if (!response.ok) {
				return;
			}

			const payload = (await response.json()) as {
				bidWindows?: unknown[];
			};

			openBidsCount = Array.isArray(payload.bidWindows) ? payload.bidWindows.length : 0;
		} catch {
			openBidsCount = 0;
		}
	}

	async function loadDriverAttentionCounts() {
		const requests: Promise<void>[] = [];

		if (showUnconfirmedShiftsButton) {
			requests.push(loadUnconfirmedShiftCount());
		}

		if (showOpenBidsButton) {
			requests.push(loadOpenBidsCount());
		}

		if (requests.length === 0) {
			return;
		}

		await Promise.all(requests);
	}

	$effect(() => {
		if (!showUnconfirmedShiftsButton && !showOpenBidsButton) {
			return;
		}

		currentPath;
		void loadDriverAttentionCounts();
	});

	$effect(() => {
		if (!showUnconfirmedShiftsButton && !showOpenBidsButton) {
			return;
		}

		const refreshIntervalId = setInterval(() => {
			void loadDriverAttentionCounts();
		}, 30000);

		return () => {
			clearInterval(refreshIntervalId);
		};
	});

	onMount(() => {
		void notificationsStore.loadPage(0);
		if (showUnfilledWindowsButton) {
			void routeStore.load();
		}
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
				compact
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
			<nav class="breadcrumb" aria-label={m.common_breadcrumb()}>
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
		{#if showUnfilledWindowsButton}
			<div class="header-notification header-route-notification">
				<IconButton
					tooltip={m.manager_attention_unfilled()}
					aria-label={unfilledAriaLabel}
					isActive={currentPath.startsWith('/routes')}
					onclick={handleUnfilledWindowsClick}
					compact
				>
					<Icon><CalendarExclamation /></Icon>
				</IconButton>
				{#if unfilledRouteBadgeLabel}
					<span class="header-badge error" aria-hidden="true">{unfilledRouteBadgeLabel}</span>
				{/if}
			</div>
		{/if}
		{#if showUnconfirmedShiftsButton}
			<div class="header-notification header-driver-unconfirmed">
				<IconButton
					tooltip={m.dashboard_confirm_section()}
					aria-label={unconfirmedShiftAriaLabel}
					isActive={currentPath.startsWith('/dashboard')}
					onclick={handleUnconfirmedShiftsClick}
					compact
				>
					<Icon><CalendarExclamation /></Icon>
				</IconButton>
				{#if unconfirmedShiftBadgeLabel}
					<span class="header-badge warning" aria-hidden="true">{unconfirmedShiftBadgeLabel}</span>
				{/if}
			</div>
		{/if}
		{#if showOpenBidsButton}
			<div class="header-notification header-driver-bids">
				<IconButton
					tooltip={m.bids_available_section()}
					aria-label={openBidsAriaLabel}
					isActive={currentPath.startsWith('/bids')}
					onclick={handleOpenBidsClick}
					compact
				>
					<Icon><Gavel /></Icon>
				</IconButton>
				{#if openBidsBadgeLabel}
					<span class="header-badge info" aria-hidden="true">{openBidsBadgeLabel}</span>
				{/if}
			</div>
		{/if}
		<div class="header-notification">
			<IconButton
				tooltip={m.nav_notifications()}
				aria-label={notificationAriaLabel}
				isActive={isNotificationsPage}
				onclick={handleNotificationsClick}
				compact
			>
				<Icon><BellRinging /></Icon>
			</IconButton>
			{#if unreadBadgeLabel}
				<span
					class="notification-badge header-badge"
					class:emergency={hasEmergencyNotifications}
					aria-hidden="true">{unreadBadgeLabel}</span
				>
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
		padding: calc(var(--spacing-2) + var(--safe-area-top)) var(--spacing-3) var(--spacing-2);
		background: var(--surface-primary);
		box-shadow: var(--shadow-base);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		z-index: 2;
		position: relative;
	}

	/* Mobile: reduce left padding so hamburger sits flush */
	@media (max-width: 640px) {
		.page-header {
			padding-left: var(--spacing-2);
		}
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

	.header-badge {
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

	.notification-badge {
		background: var(--interactive-accent);
	}

	.notification-badge.emergency {
		background: var(--status-error);
	}

	.notification-badge,
	.header-badge {
		color: var(--text-on-accent);
	}

	.header-badge.error {
		background: var(--status-error);
	}

	.header-badge.warning {
		background: var(--status-warning);
	}

	.header-badge.info {
		background: var(--status-info);
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
