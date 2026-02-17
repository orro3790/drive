<!--
	Notification Permission Card

	Shows a prompt asking the user to enable push notifications.
	Only displayed on native platforms when permission status is 'prompt'.
-->
<script lang="ts">
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import CheckIcon from '$lib/components/icons/CheckIcon.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';
	import BellRinging from '$lib/components/icons/BellRinging.svelte';
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
		<div class="icon">
			<Icon size="medium"><BellRinging /></Icon>
		</div>
		<div class="content">
			<h3>Enable Notifications</h3>
			<p>Get notified about new shift assignments, bid windows, and important updates.</p>
		</div>
		<div class="actions">
			<IconButton tooltip="Dismiss" onclick={handleDismiss}>
				<Icon size="small"><XIcon /></Icon>
			</IconButton>
			<IconButton tooltip="Enable notifications" onclick={handleEnable} disabled={isRequesting}>
				<Icon size="small"><CheckIcon /></Icon>
			</IconButton>
		</div>
	</div>
{/if}

<style>
	.notification-card {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-3);
		background: var(--surface-primary);
		border-bottom: 1px solid var(--border-muted);
		padding: var(--spacing-3);
	}

	.icon {
		flex-shrink: 0;
		color: var(--text-accent);
	}

	.content {
		flex: 1;
		min-width: 0;
	}

	.content h3 {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		margin: 0 0 var(--spacing-1) 0;
	}

	.content p {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		margin: 0;
		line-height: 1.4;
	}

	.actions {
		display: flex;
		gap: var(--spacing-1);
		flex-shrink: 0;
	}
</style>
