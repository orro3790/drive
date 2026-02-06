<!--
	Settings Page

	Full-page settings with category nav on left and content on right.
	Matches the Drive settings shell pattern.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy, onMount } from 'svelte';
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import SettingsNav, {
		type Category,
		type NavGroup
	} from '$lib/components/settings/SettingsNav.svelte';
	import AccountSection from '$lib/components/settings/AccountSection.svelte';
	import type { PageData } from './$types';
	import type { Breadcrumb } from '$lib/schemas/ui/breadcrumb';
	import { asUser } from '$lib/types/user';

	let { data }: { data: PageData } = $props();

	const user = $derived(data.user ? asUser(data.user) : null);

	let activeCategory = $state<Category | null>(null);

	// Sync activeCategory from URL param
	$effect(() => {
		const param = $page.url.searchParams.get('category') as Category | null;
		activeCategory = param ?? null;
	});

	/** Mobile drill-down: true when viewing content, false when viewing nav */
	const showContent = $derived(activeCategory !== null);

	/** Effective category for rendering - defaults to 'account' on desktop when no category selected */
	const effectiveCategory = $derived<Category>(activeCategory ?? 'account');

	// Nav groups
	const navGroups = $derived.by((): NavGroup[] => {
		return [
			{
				label: m.settings_group_personal(),
				items: ['account']
			}
		];
	});

	function setActive(c: Category) {
		activeCategory = c;
		const url = new URL($page.url);
		url.searchParams.set('category', c);
		goto(url, { keepFocus: true, noScroll: true });
	}

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
		const crumbs: Breadcrumb[] = [
			{
				label: m.common_home(),
				onSelect: goHome
			},
			{
				label: m.settings_page_title(),
				onSelect: () => goto('/settings')
			}
		];
		// Only add category crumb when viewing content
		if (activeCategory) {
			crumbs.push({ label: m.settings_account_section() });
		}
		return crumbs;
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
		<div class="settings-centered-layout">
			<div class="page-card settings-unified-card">
				<aside
					class="settings-sidebar"
					class:mobile-hidden={showContent}
					aria-label={m.settings_page_title()}
				>
					<SettingsNav active={activeCategory} onSelect={setActive} groups={navGroups} />
				</aside>
				<section
					class="settings-content-area"
					class:mobile-hidden={!showContent}
					aria-live="polite"
				>
					{#if effectiveCategory === 'account'}
						<AccountSection {user} />
					{/if}
				</section>
			</div>
		</div>
	</div>
</div>

<style>
	.settings-surface {
		width: 100%;
		height: 100%;
	}

	.settings-centered-layout {
		width: 100%;
		height: 100%;
		display: flex;
		justify-content: center;
		padding: var(--spacing-4) 0 var(--spacing-4) var(--spacing-4);
		min-height: 0;
	}

	.settings-unified-card {
		display: flex;
		flex-direction: row;
		width: 100%;
		max-width: 1200px;
		height: 100%;
		overflow: hidden;
		background: var(--surface-primary);
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		box-shadow: var(--shadow-base);
	}

	.settings-sidebar {
		width: 280px;
		min-width: 280px;
		border-right: 1px solid var(--border-muted);
		display: flex;
		flex-direction: column;
		background: var(--surface-secondary);
		overflow-y: auto;
	}

	.settings-content-area {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		background: var(--surface-primary);
	}

	/* Override inner settings cards to be flat but retain padding on desktop */
	.settings-unified-card .settings-content-area :global(.settings-card) {
		background: var(--surface-primary);
		box-shadow: none;
		border-radius: 0;
		padding: var(--spacing-4);
		margin: 0;
		width: 100%;
		margin-inline: auto;
	}

	/* Constrain sections */
	.settings-content-area > :global(*) {
		width: 100%;
	}

	/* Mobile responsive - drill-down navigation */
	@media (max-width: 767px) {
		.settings-centered-layout {
			padding: 0;
		}

		.settings-unified-card {
			border-radius: 0;
			box-shadow: none;
		}

		/* On mobile, sidebar takes full width when visible */
		.settings-sidebar {
			width: 100%;
			min-width: 100%;
			border-right: none;
		}

		/* Hide element on mobile when toggled */
		.mobile-hidden {
			display: none;
		}

		.settings-content-area {
			padding: 0;
		}

		.settings-content-area > :global(*) {
			max-width: none;
			padding-right: var(--spacing-3);
		}

		/* Flatten cards on mobile - no visual card styling */
		.settings-unified-card .settings-content-area :global(.settings-card) {
			background: transparent;
			border: none;
			border-radius: 0;
			padding: var(--spacing-0);
		}
	}
</style>
