<script lang="ts">
	import AppSidebar, { type NavItem } from '$lib/components/app-shell/AppSidebar.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';

	// Icons for driver navigation
	import Home from '$lib/components/icons/Home.svelte';
	import Calendar from '$lib/components/icons/Calendar.svelte';
	import Settings from '$lib/components/icons/Settings.svelte';
	import BellRinging from '$lib/components/icons/BellRinging.svelte';

	let { children } = $props();

	const navItems: NavItem[] = [
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
			id: 'notifications',
			label: () => m.nav_notifications(),
			Icon: BellRinging,
			path: '/notifications'
		},
		{
			id: 'settings',
			label: () => m.nav_settings(),
			Icon: Settings,
			path: '/settings'
		}
	];
</script>

<div class="app-layout">
	<AppSidebar {navItems} />
	<div class="main-content">
		<PageHeader />
		<main>
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-layout {
		display: flex;
		min-height: 100vh;
		background: var(--surface-secondary);
	}

	.main-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		padding: var(--spacing-4);
		overflow-y: auto;
	}
</style>
