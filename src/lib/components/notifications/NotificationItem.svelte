<script lang="ts">
	import type { Notification, NotificationType } from '$lib/schemas/api/notifications';
	import { notificationTypeConfig } from '$lib/config/notificationTypes';
	import { formatRelativeTime } from '$lib/utils/date/formatting';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import IconCircle from '$lib/components/primitives/IconCircle.svelte';
	import IconBase from '$lib/components/primitives/Icon.svelte';
	import Increase from '$lib/components/icons/Increase.svelte';
	import Dollar from '$lib/components/icons/Dollar.svelte';
	import Announcement from '$lib/components/icons/Announcement.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';

	let { notification, onMarkRead } = $props<{
		notification: Notification;
		onMarkRead: (id: string) => void;
	}>();

	const isPremium = $derived(
		notification.type === 'bid_open' &&
			(notification.data?.mode === 'instant' || notification.data?.mode === 'emergency')
	);
	const config = $derived.by(
		() =>
			notificationTypeConfig[notification.type as NotificationType] ?? {
				icon: Announcement,
				color: '--text-muted'
			}
	);
	const Icon = $derived.by(() => (isPremium ? Dollar : config.icon));
	const effectiveColor = $derived(isPremium ? '--status-success' : config.color);
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

	const isFromToday = $derived.by(() => {
		const created = new Date(notification.createdAt);
		const now = new Date();
		return (
			created.getFullYear() === now.getFullYear() &&
			created.getMonth() === now.getMonth() &&
			created.getDate() === now.getDate()
		);
	});

	// Navigation target for the notification — makes whole item clickable
	const navTarget = $derived.by((): string | null => {
		switch (notification.type) {
			// Dashboard targets — shift-related notifications
			case 'shift_reminder':
			case 'stale_shift_reminder':
			case 'confirmation_reminder':
				return isFromToday ? '/dashboard' : null;
			case 'bid_won':
			case 'assignment_confirmed':
			case 'streak_advanced':
			case 'streak_reset':
			case 'bonus_eligible':
			case 'corrective_warning':
			case 'warning':
				return '/dashboard';

			// Bids targets — bidding-related notifications
			case 'bid_open':
			case 'emergency_route_available':
				return isFromToday ? '/bids' : null;
			case 'bid_lost':
			case 'shift_auto_dropped':
				return '/bids';

			// Schedule targets
			case 'shift_cancelled':
			case 'route_cancelled':
				return '/schedule';

			// Preferences
			case 'schedule_locked':
				return '/preferences';

			// No navigation for generic or manager-only notifications
			case 'manual':
			case 'route_unfilled':
			case 'driver_no_show':
			case 'return_exception':
			default:
				return null;
		}
	});

	const isClickable = $derived(navTarget !== null);

	function handleMarkRead() {
		if (notification.read) return;
		onMarkRead(notification.id);
	}

	function handleClick() {
		handleMarkRead();
		if (navTarget) {
			goto(navTarget);
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
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

<article
	class="notification-item"
	data-testid="notification-row"
	data-notification-id={notification.id}
	data-notification-type={notification.type}
	class:unread={isUnread}
	class:read={!isUnread}
	class:clickable={isClickable}
	style={`--notification-accent: var(${effectiveColor});`}
	onclick={isClickable ? handleClick : undefined}
	onkeydown={isClickable ? handleKeyDown : undefined}
	role={isClickable ? 'button' : undefined}
	tabindex={isClickable ? 0 : undefined}
>
	<IconCircle color={effectiveColor} variant={isUnread ? 'default' : 'muted'}>
		<Icon />
	</IconCircle>
	<div class="notification-content">
		<div class="notification-header">
			<span class="notification-title">
				{notification.title}
				{#if isPremium}
					<span class="premium-badge">
						{notification.data?.payBonusPercent ?? '20'}%
						<Increase fill="currentColor" />
					</span>
				{/if}
			</span>
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
						color="var(--text-muted)"
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
		{#if isUnread}
			<span class="sr-only">{m.notifications_unread_label()}</span>
		{/if}
	</div>
</article>

<style>
	.notification-item {
		margin: 0;
		background: transparent;
		border-radius: var(--radius-base);
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		width: 100%;
		text-align: left;
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

	.notification-item.clickable {
		cursor: pointer;
	}

	.notification-item.clickable:focus-visible {
		outline: 2px solid var(--interactive-accent);
		outline-offset: 2px;
	}

	.notification-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		min-width: 0;
	}

	.notification-header {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.notification-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
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
		font-weight: var(--font-weight-medium);
	}

	.premium-badge {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-left: var(--spacing-1);
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		color: var(--status-success);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		vertical-align: middle;
		line-height: 1;
	}

	.premium-badge :global(svg) {
		width: 12px;
		height: 12px;
	}

	.notification-time {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
		font-weight: var(--font-weight-medium);
		flex-shrink: 0;
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

	/* Premium attention ring — spinning green border on the badge itself */
	.premium-badge::before,
	.premium-badge::after {
		--pulse-angle: 0deg;
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		box-sizing: border-box;
		background-image: conic-gradient(
			from var(--pulse-angle),
			transparent 20%,
			color-mix(in srgb, var(--status-success) 40%, transparent) 30%,
			var(--status-success) 35%,
			transparent 40%,
			transparent 70%,
			color-mix(in srgb, var(--status-success) 40%, transparent) 80%,
			var(--status-success) 85%,
			transparent 90%
		);
		animation: premium-attention-spin 6s linear infinite;
		z-index: -1;
		pointer-events: none;
		padding: 1px;
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
		-webkit-mask-composite: xor;
	}

	.premium-badge::before {
		filter: blur(0.5rem);
		opacity: 0.5;
	}

	.premium-badge::after {
		opacity: 1;
	}

	@keyframes premium-attention-spin {
		from {
			--pulse-angle: 0deg;
		}
		to {
			--pulse-angle: 360deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.premium-badge::before,
		.premium-badge::after {
			animation: none;
		}
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
			padding: var(--spacing-3);
		}

		.icon-circle {
			width: 28px;
			height: 28px;
		}

		.icon-circle :global(svg) {
			width: 20px;
			height: 20px;
		}
	}
</style>
