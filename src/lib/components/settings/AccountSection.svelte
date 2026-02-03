<!--
@component
AccountSection - Account details section for settings page.
Displays user's name, email, and role.
-->
<script lang="ts">
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import type { User } from '$lib/types/user';

	let { user }: { user: User | null } = $props();

	const roleLabel = $derived(
		user?.role === 'manager' ? m.settings_account_role_manager() : m.settings_account_role_driver()
	);
</script>

<section aria-labelledby="account-section" class="account-settings-stack">
	{#if user}
		<div class="settings-card">
			<SettingsGroupTitle title={m.settings_account_section()} id="account-section" />
			<SettingsGrid>
				<SettingsRow>
					{#snippet label()}
						<div class="title">{m.settings_account_name_label()}</div>
					{/snippet}
					{#snippet control()}
						<span class="value">{user.name ?? '—'}</span>
					{/snippet}
				</SettingsRow>
				<SettingsRow>
					{#snippet label()}
						<div class="title">{m.settings_account_email_label()}</div>
					{/snippet}
					{#snippet control()}
						<span class="value">{user.email}</span>
					{/snippet}
				</SettingsRow>
				<SettingsRow>
					{#snippet label()}
						<div class="title">{m.settings_account_role_label()}</div>
					{/snippet}
					{#snippet control()}
						<span class="role-badge">{roleLabel}</span>
					{/snippet}
				</SettingsRow>
			</SettingsGrid>
		</div>
	{:else}
		<div class="settings-card">
			<p class="not-signed-in">Not signed in</p>
		</div>
	{/if}
</section>

<style>
	.account-settings-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	/* settings-card is styled by the parent shell via :global */

	.value {
		color: var(--text-normal);
		font-size: var(--font-size-base);
	}

	.role-badge {
		padding: var(--spacing-0-5) var(--spacing-2);
		background: var(--interactive-accent-muted);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--interactive-accent);
	}

	.not-signed-in {
		color: var(--text-muted);
		padding: var(--spacing-3);
	}
</style>
