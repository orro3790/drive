<!--
	Settings Page

	Full-page settings with category nav on left and content on right.
	Matches the Drive settings shell pattern.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import AccountSection from '$lib/components/settings/AccountSection.svelte';
	import ManagerDispatchSection from '$lib/components/settings/ManagerDispatchSection.svelte';
	import ManagerHealthPolicySection from '$lib/components/settings/ManagerHealthPolicySection.svelte';

	import type { PageData } from './$types';
	import type { Breadcrumb } from '$lib/schemas/ui/breadcrumb';
	import { asUser } from '$lib/types/user';

	let { data }: { data: PageData } = $props();

	const user = $derived(data.user ? asUser(data.user) : null);

	function goHome() {
		const home = user?.role === 'manager' ? '/routes' : '/dashboard';
		goto(home);
	}

	function getStoredFcmToken(): string | null {
		if (typeof window === 'undefined') return null;
		try {
			const storageKeys = ['fcmToken', 'fcm_token', 'firebase_fcm_token'];
			for (const key of storageKeys) {
				const token = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
				if (token && token.trim()) return token.trim();
			}
			const globalToken = (window as { fcmToken?: string; __fcmToken?: string }).fcmToken;
			const legacyToken = (window as { fcmToken?: string; __fcmToken?: string }).__fcmToken;
			return globalToken?.trim() || legacyToken?.trim() || null;
		} catch {
			return null;
		}
	}

	async function registerFcmToken(token: string) {
		try {
			const res = await fetch('/api/users/fcm-token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token })
			});
			if (!res.ok) {
				throw new Error('fcm-register-failed');
			}
		} catch {
			toastStore.error(m.settings_fcm_register_error());
		}
	}

	// Build breadcrumbs and sync to page header store
	const breadcrumbs = $derived.by((): Breadcrumb[] => {
		return [
			{
				label: m.common_home(),
				onSelect: goHome
			},
			{
				label: m.settings_page_title(),
				onSelect: () => goto('/settings')
			}
		];
	});

	// Sync to page header store
	$effect(() => {
		pageHeaderStore.configure({
			title: m.settings_page_title(),
			breadcrumbs
		});
	});

	onMount(() => {
		if (!user) return;
		const token = getStoredFcmToken();
		if (token) {
			void registerFcmToken(token);
		}
	});

	// Reset page header when leaving
	onDestroy(() => {
		pageHeaderStore.reset();
	});
</script>

<svelte:head>
	<title>{m.settings_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface settings-surface">
	<div class="page-stage settings-stage">
		<div class="settings-content-shell">
			<section class="settings-content-area" aria-live="polite">
				<AccountSection {user} />
				{#if user?.role === 'manager'}
					<ManagerDispatchSection />
					<ManagerHealthPolicySection />
				{/if}
			</section>
		</div>
	</div>
</div>

<style>
	.settings-surface {
		width: 100%;
		min-height: 100%;
	}

	.settings-stage {
		padding: 0;
		gap: 0;
	}

	.settings-content-shell {
		width: 100%;
		max-width: 1080px;
		margin: 0 auto;
	}

	.settings-content-area {
		min-height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		padding: var(--spacing-4);
		padding-bottom: calc(var(--spacing-4) + env(safe-area-inset-bottom, 0px));
	}

	.settings-content-area :global(.settings-card) {
		width: 100%;
	}

	@media (max-width: 767px) {
		.settings-stage {
			padding: 0;
		}

		.settings-content-area {
			padding: var(--spacing-3);
			padding-bottom: calc(var(--spacing-3) + env(safe-area-inset-bottom, 0px));
			gap: var(--spacing-3);
		}
	}
</style>
