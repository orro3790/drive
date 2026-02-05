<!--
@component
NotificationsPage

Displays the current user's notification inbox with pagination and read actions.
Uses notificationsStore for data loading and optimistic read updates.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import DataTablePagination from '$lib/components/data-table/DataTablePagination.svelte';
	import { notificationsStore } from '$lib/stores/notificationsStore.svelte';
	import { formatUiDateTime } from '$lib/utils/date/formatting';

	const hasUnread = $derived(notificationsStore.unreadCount > 0);
	const pagination = $derived(notificationsStore.pagination);
	const canPreviousPage = $derived(pagination.pageIndex > 0);
	const canNextPage = $derived(pagination.pageIndex < pagination.pageCount - 1);

	function handleMarkAllRead() {
		void notificationsStore.markAllRead();
	}

	function handleMarkRead(notificationId: string) {
		void notificationsStore.markRead(notificationId);
	}

	function goToFirstPage() {
		void notificationsStore.loadPage(0);
	}

	function goToPreviousPage() {
		if (!canPreviousPage) return;
		void notificationsStore.loadPage(pagination.pageIndex - 1);
	}

	function goToNextPage() {
		if (!canNextPage) return;
		void notificationsStore.loadPage(pagination.pageIndex + 1);
	}

	function goToLastPage() {
		void notificationsStore.loadPage(pagination.pageCount - 1);
	}

	onMount(() => {
		void notificationsStore.loadPage(0);
	});
</script>

<svelte:head>
	<title>{m.notifications_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface notifications-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.notifications_page_title()}</h1>
				<p>{m.notifications_page_description()}</p>
			</div>
			<div class="header-actions">
				<Button
					variant="secondary"
					size="small"
					onclick={handleMarkAllRead}
					disabled={!hasUnread}
					isLoading={notificationsStore.isMarkingAll}
				>
					{m.notifications_mark_all()}
				</Button>
			</div>
		</div>

		<div class="page-card notifications-card">
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
				<div class="notifications-list">
					{#each notificationsStore.notifications as notification (notification.id)}
						<Button
							variant="secondary-inverted"
							size="small"
							fill
							class={`notification-item ${notification.read ? 'read' : 'unread'}`}
							onclick={() => handleMarkRead(notification.id)}
						>
							<div class="notification-content">
								<div class="notification-main">
									<div class="notification-title-row">
										{#if !notification.read}
											<span class="unread-dot" aria-hidden="true"></span>
											<span class="sr-only">{m.notifications_unread_label()}</span>
										{/if}
										<span class="notification-title">{notification.title}</span>
									</div>
									<p class="notification-body">{notification.body}</p>
								</div>
								<div class="notification-meta">
									<span class="notification-time">
										{formatUiDateTime(notification.createdAt)}
									</span>
								</div>
							</div>
						</Button>
					{/each}
				</div>

				{#if pagination.pageCount > 1}
					<div class="notifications-pagination">
						<DataTablePagination
							currentPage={pagination.pageIndex}
							pageCount={pagination.pageCount}
							{canPreviousPage}
							{canNextPage}
							onFirstPage={goToFirstPage}
							onPreviousPage={goToPreviousPage}
							onNextPage={goToNextPage}
							onLastPage={goToLastPage}
						/>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.notifications-surface {
		width: 100%;
		height: 100%;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-3);
		padding: var(--spacing-4) var(--spacing-4) var(--spacing-2);
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--font-size-xl);
		color: var(--text-normal);
	}

	.header-text p {
		margin: var(--spacing-1) 0 0;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.notifications-card {
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		margin: 0 var(--spacing-4) var(--spacing-4);
		overflow: hidden;
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

	.notifications-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	:global(.notification-item) {
		--btn-bg: var(--surface-primary);
		--btn-hover-bg: var(--surface-secondary);
		--btn-border: var(--border-width-thin) solid var(--border-primary);
		--btn-fg: var(--text-normal);
		width: 100%;
		text-align: left;
		justify-content: flex-start;
		align-items: stretch;
	}

	:global(.notification-item.unread) {
		--btn-bg: color-mix(in srgb, var(--interactive-accent) 6%, var(--surface-primary));
		--btn-hover-bg: color-mix(in srgb, var(--interactive-accent) 12%, var(--surface-primary));
		--btn-border: var(--border-width-thin) solid
			color-mix(in srgb, var(--interactive-accent) 30%, var(--border-primary));
	}

	:global(.notification-item) :global(.content-wrapper) {
		width: 100%;
		justify-content: flex-start;
	}

	:global(.notification-item) :global(.content) {
		width: 100%;
		justify-content: flex-start;
	}

	.notification-content {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--spacing-3);
		width: 100%;
	}

	.notification-main {
		flex: 1;
		min-width: 0;
	}

	.notification-title-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		margin-bottom: var(--spacing-1);
	}

	.notification-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	:global(.notification-item.unread) .notification-title {
		font-weight: var(--font-weight-bold);
	}

	:global(.notification-item.read) .notification-title {
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.notification-body {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.notification-meta {
		flex-shrink: 0;
		color: var(--text-faint);
		font-size: var(--font-size-xs);
		margin-top: 2px;
	}

	.unread-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--interactive-accent);
		display: inline-block;
		flex-shrink: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.notifications-pagination {
		margin-top: var(--spacing-2);
	}

	@media (max-width: 768px) {
		.page-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.notifications-card {
			margin: 0 var(--spacing-3) var(--spacing-4);
		}

		.notification-content {
			flex-direction: column;
			align-items: flex-start;
		}
	}

	@media (max-width: 480px) {
		.page-header {
			padding: var(--spacing-3);
		}

		.notifications-card {
			margin: 0 var(--spacing-2) var(--spacing-3);
			padding: var(--spacing-2);
		}
	}
</style>
