<!--
@component
Collapsible navigation sidebar for the app shell.

Desktop: Persistent sidebar, 220px expanded / ~50px collapsed
Mobile: Hidden by default, hamburger in header opens overlay

@prop role - User role ('driver' | 'manager') determines which nav items display
-->
<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { appSidebarStore } from '$lib/stores/app-shell/appSidebarStore.svelte';
	import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime.js';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth-client';

	// Import icons
	import Award from '$lib/components/icons/Award.svelte';
	import Calendar from '$lib/components/icons/Calendar.svelte';
	import CalendarCog from '$lib/components/icons/CalendarCog.svelte';
	import Home from '$lib/components/icons/Home.svelte';
	import Building from '$lib/components/icons/Building.svelte';
	import Driver from '$lib/components/icons/Driver.svelte';
	import Route from '$lib/components/icons/Route.svelte';
	import Settings from '$lib/components/icons/Settings.svelte';
	import Logout from '$lib/components/icons/Logout.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import SidebarItem from './SidebarItem.svelte';
	import type { Component } from 'svelte';

	type UserRole = 'driver' | 'manager';

	let { role }: { role: UserRole } = $props();

	let isLoggingOut = $state(false);

	type NavItem = {
		id: string;
		label: () => string;
		Icon: Component;
		path: string;
	};

	const isExpanded = $derived(appSidebarStore.state.state === 'expanded');
	const isMobile = $derived(appSidebarStore.state.isMobile);
	let currentPath = $derived($page.url.pathname);

	const driverNavItems: NavItem[] = [
		{
			id: 'dashboard',
			label: () => m.nav_dashboard(),
			Icon: Home,
			path: '/dashboard'
		},
		{
			id: 'schedule',
			label: () => m.nav_schedule(),
			Icon: Calendar,
			path: '/schedule'
		},
		{
			id: 'bids',
			label: () => m.nav_bids(),
			Icon: Award,
			path: '/bids'
		}
	];

	const managerNavItems: NavItem[] = [
		{
			id: 'drivers',
			label: () => m.nav_drivers(),
			Icon: Driver,
			path: '/drivers'
		},
		{
			id: 'routes',
			label: () => m.nav_routes(),
			Icon: Route,
			path: '/routes'
		},
		{
			id: 'warehouses',
			label: () => m.nav_warehouses(),
			Icon: Building,
			path: '/warehouses'
		}
	];

	const navItems = $derived(role === 'manager' ? managerNavItems : driverNavItems);

	function isSelected(path: string) {
		return currentPath.startsWith(path);
	}

	function handleNavClick(path: string) {
		if (isMobile) appSidebarStore.collapse();
		goto(path);
	}

	// Responsive breakpoint detection
	$effect(() => {
		const checkMobile = () => {
			appSidebarStore.setMobile(window.innerWidth < 768);
		};
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	});

	// Language toggle (hidden until we need multi-language support)
	const SHOW_LANGUAGE_TOGGLE = false;
	const LANG_LABELS: Record<Locale, string> = {
		en: 'EN',
		zh: '中文'
	};

	const currentLocale = $derived(getLocale());

	function handleLanguageToggle() {
		const newLocale = currentLocale === 'en' ? 'zh' : 'en';
		setLocale(newLocale);
	}

	async function handleLogout() {
		if (isLoggingOut) return;
		isLoggingOut = true;
		try {
			await authClient.signOut();
			await invalidateAll();
			await goto('/sign-in');
		} catch (error) {
			console.error('Logout failed:', error);
		} finally {
			isLoggingOut = false;
		}
	}
</script>

<!-- Mobile backdrop -->
{#if isMobile && isExpanded}
	<button
		class="sidebar-backdrop"
		onclick={() => appSidebarStore.collapse()}
		aria-label={m.sidebar_close()}
	></button>
{/if}

<nav
	class="sidebar"
	class:expanded={isExpanded}
	class:mobile={isMobile}
	aria-label={m.sidebar_main_nav()}
>
	<div class="nav-section">
		<!-- Main navigation -->
		<div class="nav-group">
			{#each navItems as { id, label, Icon: NavIcon, path } (id)}
				<SidebarItem
					label={label()}
					onClick={() => handleNavClick(path)}
					selected={isSelected(path)}
				>
					{#snippet icon()}
						<Icon><NavIcon /></Icon>
					{/snippet}
				</SidebarItem>
			{/each}
		</div>

		<!-- Footer: settings, language toggle, logout -->
		<div class="nav-group nav-bottom">
			<SidebarItem
				label={m.nav_settings()}
				onClick={() => handleNavClick('/settings')}
				selected={isSelected('/settings')}
			>
				{#snippet icon()}
					<Icon><Settings /></Icon>
				{/snippet}
			</SidebarItem>

			{#if SHOW_LANGUAGE_TOGGLE}
				<button
					class="lang-toggle"
					onclick={handleLanguageToggle}
					aria-label={m.sidebar_toggle_language()}
				>
					{#if isExpanded}
						<!-- Expanded: show both options side by side -->
						{#each Object.entries(LANG_LABELS) as [locale, label] (locale)}
							<span class="lang-option" class:active={currentLocale === locale}>
								{label}
							</span>
							{#if locale === 'en'}
								<span class="lang-separator">|</span>
							{/if}
						{/each}
					{:else}
						<!-- Collapsed: show only current locale -->
						<span class="lang-option active">{LANG_LABELS[currentLocale]}</span>
					{/if}
				</button>
			{/if}

			<SidebarItem
				label={isLoggingOut ? m.sidebar_logging_out() : m.sidebar_logout()}
				onClick={handleLogout}
				disabled={isLoggingOut}
			>
				{#snippet icon()}
					<Icon><Logout /></Icon>
				{/snippet}
			</SidebarItem>
		</div>
	</div>
</nav>

<style>
	.sidebar-backdrop {
		position: fixed;
		inset: 0;
		background: var(--overlay-backdrop);
		z-index: calc(var(--z-drawer) - 1);
		border: none;
		cursor: pointer;
	}

	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		height: 100vh;
		background: var(--surface-primary);
		display: flex;
		width: fit-content;
		flex-shrink: 0;
		flex-direction: column;
		transition: transform 0.15s ease-out;
		z-index: var(--z-drawer);
		transform: translateX(-100%);
	}

	.sidebar.expanded {
		transform: translateX(0);
	}

	.sidebar.mobile.expanded {
		width: clamp(260px, 80vw, 320px);
	}

	.nav-section {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		padding: var(--spacing-2);
	}

	.sidebar.expanded > .nav-section {
		padding: var(--spacing-2) var(--spacing-3) var(--spacing-3) var(--spacing-3);
		gap: var(--spacing-4);
	}

	.nav-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.nav-bottom {
		margin-top: auto;
	}

	.lang-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-1);
		padding: var(--spacing-1-5) var(--spacing-2);
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: 0.02em;
		width: 100%;
		border-radius: var(--radius-base);
		transition: background-color 0.15s ease;
	}

	.lang-toggle:hover {
		background: var(--interactive-hover);
	}

	.lang-option {
		color: var(--text-muted);
		transition: color var(--transition-duration-100) var(--transition-ease);
	}

	.lang-option.active {
		color: var(--text-normal);
	}

	.lang-toggle:hover .lang-option {
		color: var(--text-normal);
	}

	.lang-separator {
		color: var(--text-faint);
	}

	/* Desktop: persistent sidebar */
	@media (min-width: 768px) {
		.sidebar {
			position: relative;
			transform: none;
			width: calc(28px + var(--spacing-2) + var(--spacing-2));
			transition: width 0.15s ease-out;
			z-index: var(--z-drawer);
			--sidebar-item-width: 28px;
		}

		.sidebar.expanded {
			width: 220px;
			--sidebar-item-width: auto;
		}

		.sidebar:not(.expanded) :global(.nav-text) {
			display: none;
		}
	}
</style>
