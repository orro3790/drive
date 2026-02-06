<script lang="ts">
	import type { Notification, NotificationType } from '$lib/schemas/api/notifications';
	import { notificationTypeConfig } from '$lib/config/notificationTypes';
	import { formatRelativeTime } from '$lib/utils/date/formatting';
	import * as m from '$lib/paraglide/messages.js';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import IconBase from '$lib/components/primitives/Icon.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';

	let { notification, onMarkRead } = $props<{
		notification: Notification;
		onMarkRead: (id: string) => void;
	}>();

	const config = $derived.by(() => notificationTypeConfig[notification.type as NotificationType]);
	const Icon = $derived.by(() => config.icon);
	const accentColor = $derived.by(() => `var(${config.color})`);
	const isUnread = $derived(!notification.read);
	const metadataChips = $derived.by(() => {
		const chips: { label: string; type: 'route' | 'warehouse' }[] = [];
		if (notification.data?.routeName) {
			chips.push({ label: notification.data.routeName, type: 'route' });
		}
		if (notification.data?.warehouseName) {
			chips.push({ label: notification.data.warehouseName, type: 'warehouse' });
		}
		return chips;
	});
	const timeLabel = $derived.by(() => formatRelativeTime(notification.createdAt) || '');

	const cta = $derived.by(() => {
		switch (notification.type) {
			case 'bid_open':
				return { href: '/bids', label: m.notifications_cta_place_bid() };
			case 'shift_reminder':
				return { href: '/dashboard', label: m.notifications_cta_view_dashboard() };
			default:
				return null;
		}
	});

	function handleMarkRead() {
		if (notification.read) return;
		onMarkRead(notification.id);
	}

	function handleCtaClick(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

{#snippet routeChipIcon()}
	<IconBase size="small">
		<RouteIcon />
	</IconBase>
{/snippet}

{#snippet warehouseChipIcon()}
	<IconBase size="small">
		<WarehouseIcon />
	</IconBase>
{/snippet}

<button
	type="button"
	class="notification-item"
	class:unread={isUnread}
	class:read={!isUnread}
	style={`--notification-accent: var(${config.color});`}
	onclick={handleMarkRead}
>
	<div class="icon-circle" aria-hidden="true">
		<Icon />
	</div>
	<div class="notification-content">
		<div class="notification-header">
			<span class="notification-title">{notification.title}</span>
			{#if timeLabel}
				<span class="notification-time">{timeLabel}</span>
			{/if}
		</div>
		<p class="notification-body">{notification.body}</p>
		{#if metadataChips.length}
			<div class="notification-meta">
				{#each metadataChips as chip (chip.label)}
					<Chip
						variant="tag"
						size="xs"
						color={accentColor}
						label={chip.label}
						icon={chip.type === 'route'
							? routeChipIcon
							: chip.type === 'warehouse'
								? warehouseChipIcon
								: null}
					/>
				{/each}
			</div>
		{/if}
		{#if cta}
			<a class="notification-cta" href={cta.href} onclick={handleCtaClick}>
				{cta.label}
			</a>
		{/if}
		{#if isUnread}
			<span class="sr-only">{m.notifications_unread_label()}</span>
		{/if}
	</div>
</button>

<style>
	.notification-item {
		--item-bg: var(--surface-primary);
		background: var(--item-bg);
		border-radius: var(--radius-lg);
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		width: 100%;
		text-align: left;
		cursor: pointer;
		transition:
			background 150ms ease,
			border-color 150ms ease,
			opacity 150ms ease;
	}

	.notification-item.read {
		opacity: 0.65;
	}

	.notification-item:hover {
		background: color-mix(in srgb, var(--text-normal) 4%, transparent);
	}

	.icon-circle {
		position: relative;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--notification-accent) 12%, transparent);
		color: var(--notification-accent);
	}

	.notification-item.unread .icon-circle::after {
		content: '';
		position: absolute;
		top: -2px;
		right: -2px;
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--notification-accent);
	}

	.icon-circle :global(svg) {
		width: 16px;
		height: 16px;
	}

	.notification-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		min-width: 0;
	}

	.notification-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-1);
	}

	.notification-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		line-height: 1.3;
	}

	.notification-item.unread .notification-title {
		font-weight: var(--font-weight-bold);
	}

	.notification-item.read .notification-title {
		color: var(--text-muted);
	}

	.notification-time {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
		flex-shrink: 0;
		font-weight: var(--font-weight-medium);
	}

	.notification-body {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.notification-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1);
		align-items: center;
	}

	.notification-cta {
		font-size: var(--font-size-xs);
		color: var(--interactive-accent);
		text-decoration: none;
		width: fit-content;
	}

	.notification-cta:hover {
		text-decoration: underline;
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

	@media (pointer: coarse) {
		.notification-item {
			min-height: 44px;
		}
	}

	@media (max-width: 640px) {
		.notification-item {
			gap: var(--spacing-2);
			padding: var(--spacing-2);
		}

		.icon-circle {
			width: 28px;
			height: 28px;
		}

		.icon-circle :global(svg) {
			width: 14px;
			height: 14px;
		}

		.notification-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-half);
		}
	}
</style>
