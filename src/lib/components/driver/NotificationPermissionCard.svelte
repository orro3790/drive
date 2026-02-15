<!--
	Notification Permission Card

	Shows a prompt asking the user to enable push notifications.
	Only displayed on native platforms when permission status is 'prompt'.
-->
<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import {
		isNativePlatform,
		checkPushPermissionStatus,
		requestPushPermission,
		type PushPermissionStatus
	} from '$lib/utils/pushNotifications';
	import { onMount } from 'svelte';

	let permissionStatus = $state<PushPermissionStatus>('unknown');
	let isRequesting = $state(false);
	let dismissed = $state(false);

	// Check if we should show the card
	const shouldShow = $derived(isNativePlatform() && permissionStatus === 'prompt' && !dismissed);

	onMount(async () => {
		permissionStatus = await checkPushPermissionStatus();
	});

	async function handleEnable() {
		isRequesting = true;
		try {
			permissionStatus = await requestPushPermission();
		} finally {
			isRequesting = false;
		}
	}

	function handleDismiss() {
		dismissed = true;
	}
</script>

{#if shouldShow}
	<div class="notification-card">
		<div class="content">
			<div class="icon">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
					<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
				</svg>
			</div>
			<div class="text">
				<h3>Enable Notifications</h3>
				<p>Get notified about new shift assignments, bid windows, and important updates.</p>
			</div>
		</div>
		<div class="actions">
			<Button variant="ghost" size="small" onclick={handleDismiss}>Not now</Button>
			<Button variant="primary" size="small" onclick={handleEnable} disabled={isRequesting}>
				{isRequesting ? 'Enabling...' : 'Enable'}
			</Button>
		</div>
	</div>
{/if}

<style>
	.notification-card {
		background: var(--surface-primary);
		border: 1px solid var(--border-secondary);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.content {
		display: flex;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-full);
		background: var(--surface-accent);
		color: var(--text-accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.text h3 {
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 var(--space-1) 0;
	}

	.text p {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin: 0;
		line-height: 1.4;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
	}
</style>
