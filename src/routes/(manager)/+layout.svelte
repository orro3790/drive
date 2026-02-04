<script lang="ts">
	import AppSidebar, { type NavItem } from '$lib/components/app-shell/AppSidebar.svelte';
	import PageHeader from '$lib/components/app-shell/PageHeader.svelte';
	import * as m from '$lib/paraglide/messages.js';

	// Icons for manager navigation
	import MapPin from '$lib/components/icons/MapPin.svelte';
	import Users from '$lib/components/icons/Users.svelte';
	import Warehouse from '$lib/components/icons/Warehouse.svelte';

	let { children } = $props();

	const navItems: NavItem[] = [
		{
			id: 'routes',
			label: () => m.nav_routes(),
			Icon: MapPin,
			path: '/routes'
		},
		{
			id: 'drivers',
			label: () => m.nav_drivers(),
			Icon: Users,
			path: '/drivers'
		},
		{
			id: 'warehouses',
			label: () => m.nav_warehouses(),
			Icon: Warehouse,
			path: '/warehouses'
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
