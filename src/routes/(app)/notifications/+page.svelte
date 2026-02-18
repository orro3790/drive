<!--
@component
NotificationsPage

Displays the current user's notification inbox with pagination and read actions.
Uses notificationsStore for data loading and optimistic read updates.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import NotificationItem from '$lib/components/notifications/NotificationItem.svelte';
	import ClearAll from '$lib/components/icons/ClearAll.svelte';
	import { notificationsStore } from '$lib/stores/notificationsStore.svelte';
	import { getTimeGroup } from '$lib/utils/date/formatting';

	const hasUnread = $derived(notificationsStore.unreadCount > 0);
	let sentinelEl = $state<HTMLDivElement | null>(null);
	const groupedNotifications = $derived.by(() => {
		const groups: { key: string; label: string; items: typeof notificationsStore.notifications }[] =
			[];
		const groupMap = new Map<string, typeof notificationsStore.notifications>();
		const order = ['today', 'yesterday', 'this_week', 'earlier'];
		const labels: Record<string, () => string> = {
			today: m.notifications_group_today,
			yesterday: m.notifications_group_yesterday,
			this_week: m.notifications_group_this_week,
			earlier: m.notifications_group_earlier
		};

		for (const notification of notificationsStore.notifications) {
			const key = getTimeGroup(notification.createdAt);
			if (!groupMap.has(key)) groupMap.set(key, []);
			groupMap.get(key)?.push(notification);
		}

		for (const key of order) {
			const items = groupMap.get(key);
			if (items?.length) {
				groups.push({ key, label: labels[key](), items });
			}
		}

		return groups;
	});

	function handleMarkAllRead() {
		void notificationsStore.markAllRead();
	}

	function handleMarkRead(notificationId: string) {
		void notificationsStore.markRead(notificationId);
	}

	onMount(() => {
		void notificationsStore.loadPage(0);

		$effect(() => {
			if (!sentinelEl) return;

			const root = sentinelEl.closest('[data-scroll-root]') as HTMLElement | null;
			const target = sentinelEl;
			const observer = new IntersectionObserver(
				(entries) => {
					if (entries.some((entry) => entry.isIntersecting)) {
						void notificationsStore.loadMore();
					}
				},
				{
					root,
					rootMargin: '0px 0px 240px 0px',
					threshold: 0.01
				}
			);

			observer.observe(target);

			return () => observer.disconnect();
		});
	});
</script>

<svelte:head>
	<title>{m.notifications_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div
		class="page-stage"
		data-testid="notifications-list"
		data-loaded={notificationsStore.isLoading ? 'false' : 'true'}
	>
		<div class="page-header">
			<div class="header-text">
				<h1>{m.notifications_page_title()}</h1>
				<p>{m.notifications_page_description()}</p>
			</div>
		</div>

		{#if notificationsStore.isLoading}
			<div class="notifications-loading">
				<Spinner size={24} label={m.common_loading()} />
			</div>
		{:else if notificationsStore.error}
			<NoticeBanner variant="warning">
				<p>{m.notifications_load_error()}</p>
			</NoticeBanner>
		{:else if notificationsStore.notifications.length === 0}
			<div class="notifications-empty">
				<h3>{m.notifications_empty_title()}</h3>
				<p>{m.notifications_empty_message()}</p>
			</div>
		{:else}
			{#if hasUnread}
				<div class="unread-row">
					<span class="unread-label"
						>{m.notifications_unread_label()} ({notificationsStore.unreadCount})</span
					>
					<IconButton
						tooltip={m.notifications_mark_all()}
						onclick={handleMarkAllRead}
						disabled={notificationsStore.isMarkingAll}
						compact
					>
						<Icon size="small">
							<ClearAll />
						</Icon>
					</IconButton>
				</div>
			{/if}
			<div class="notifications-groups">
				{#each groupedNotifications as group (group.key)}
					<div class="notification-group">
						<h3 class="group-label">{group.label}</h3>
						<div class="group-items">
							{#each group.items as notification (notification.id)}
								<NotificationItem {notification} onMarkRead={handleMarkRead} />
							{/each}
						</div>
					</div>
				{/each}
			</div>

			{#if notificationsStore.hasMore}
				<div class="scroll-sentinel" bind:this={sentinelEl}>
					{#if notificationsStore.isLoadingMore}
						<Spinner size={20} label={m.common_loading()} />
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.page-surface {
		flex: 1;
		background: var(--surface-inset);
	}

	.page-stage {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--spacing-4);
		width: 100%;
	}

	.page-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-5);
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		padding-left: var(--spacing-2);
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.header-text p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.unread-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--spacing-3);
		margin-bottom: var(--spacing-3);
	}

	.unread-label {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
	}

	.notifications-loading {
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.notifications-empty {
		text-align: center;
		padding: var(--spacing-6) var(--spacing-4);
		color: var(--text-muted);
	}

	.notifications-empty h3 {
		margin: 0 0 var(--spacing-1);
		font-size: var(--font-size-lg);
		color: var(--text-normal);
	}

	.notifications-empty p {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.notifications-groups {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-5);
	}

	.notification-group {
		display: flex;
		flex-direction: column;
	}

	.group-label {
		margin: 0 0 var(--spacing-2);
		padding: 0 var(--spacing-3);
		font-size: var(--font-size-xs);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
	}

	.group-items {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.scroll-sentinel {
		display: flex;
		justify-content: center;
		padding: var(--spacing-3);
		min-height: 1px;
	}

	@media (max-width: 767px) {
		.page-stage {
			padding: var(--spacing-2);
		}

		.page-header {
			gap: var(--spacing-2);
			margin-bottom: var(--spacing-3);
		}

		.header-text h1 {
			font-size: var(--font-size-lg);
		}
	}
</style>
