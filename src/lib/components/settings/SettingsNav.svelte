<!--
@component
SettingsNav - Navigation sidebar for settings page.
Uses SidebarItem for consistent styling with app sidebar.
-->
<script lang="ts">
	import Icon from '$lib/components/primitives/Icon.svelte';
	import SidebarItem from '$lib/components/app-shell/SidebarItem.svelte';
	import UserCircle from '$lib/components/icons/UserCircle.svelte';
	import * as m from '$lib/paraglide/messages.js';

	export type Category = 'account';

	export interface NavGroup {
		label?: string;
		items: Category[];
	}

	const {
		active = null,
		onSelect,
		groups
	} = $props<{
		active?: Category | null;
		onSelect: (category: Category) => void;
		groups: NavGroup[];
	}>();

	const ICONS = {
		account: UserCircle
	} as const;

	const LABELS: Record<Category, string> = $derived({
		account: m.settings_account_section()
	});

	function iconFor(category: Category) {
		return ICONS[category as keyof typeof ICONS] ?? UserCircle;
	}

	function labelFor(category: Category) {
		return LABELS[category] ?? category;
	}
</script>

<nav class="settings-nav" aria-label={m.settings_page_title()}>
	<ul class="nav-list">
		{#each groups as group, i}
			{#if group.label}
				<li class="group-label">{group.label}</li>
			{/if}
			{#each group.items as category (category)}
				<li class="nav-item-bridge">
					<SidebarItem
						label={labelFor(category)}
						onClick={() => onSelect(category)}
						selected={category === active}
					>
						{#snippet icon()}
							{@const IconComponent = iconFor(category)}
							<Icon><IconComponent /></Icon>
						{/snippet}
					</SidebarItem>
				</li>
			{/each}
			{#if i !== groups.length - 1}
				<li class="group-spacer" aria-hidden="true"></li>
			{/if}
		{/each}
	</ul>
</nav>

<style>
	.settings-nav {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: transparent;
		padding: var(--spacing-4);
	}

	@media (max-width: 767px) {
		.settings-nav {
			padding: 0 var(--spacing-3) 0 0;
		}
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		flex: 1;
	}

	.nav-item-bridge {
		display: block;
	}

	/* Apply sizing/padding and active background to the embedded SidebarItem */
	.nav-item-bridge :global(.nav-item) {
		width: 100%;
		padding: 0;
		height: var(--spacing-5);
	}

	.nav-item-bridge :global(.icon-center) {
		width: var(--spacing-5);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	/* Override SidebarItem's accent color for settings nav - use subtle hover instead */
	.nav-item-bridge :global(.nav-item.selected) {
		background-color: var(--interactive-hover);
		color: var(--text-normal);
	}

	.nav-item-bridge :global(.nav-item.selected:hover) {
		background-color: var(--interactive-hover);
	}

	.nav-item-bridge :global(.nav-item.selected .icon) {
		color: var(--text-normal);
	}

	.group-label {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		padding: 0 var(--spacing-2);
		height: var(--spacing-5);
		display: flex;
		align-items: center;
	}

	.group-spacer {
		height: 28px;
	}
</style>
