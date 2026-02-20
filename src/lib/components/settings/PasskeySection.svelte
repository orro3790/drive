<!--
@component
PasskeySection - Manage WebAuthn passkeys for passwordless authentication.
Allows users to add, view, and remove passkeys.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { authClient } from '$lib/auth-client';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Key from '$lib/components/icons/Key.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import Add from '$lib/components/icons/Add.svelte';

	interface Passkey {
		id: string;
		name: string | null;
		createdAt: string | null;
	}

	let passkeys = $state<Passkey[]>([]);
	let isLoading = $state(true);
	let isAdding = $state(false);
	let deleteTarget = $state<Passkey | null>(null);
	let isDeleting = $state(false);
	let isSupported = $state(true);

	onMount(async () => {
		// Check WebAuthn support
		if (
			typeof window === 'undefined' ||
			!window.PublicKeyCredential ||
			!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
		) {
			isSupported = false;
			isLoading = false;
			return;
		}

		try {
			const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
			isSupported = available;
		} catch {
			isSupported = false;
		}

		await loadPasskeys();
	});

	async function loadPasskeys() {
		isLoading = true;
		try {
			const { data, error } = await authClient.passkey.listUserPasskeys();
			if (error) {
				throw error;
			}
			passkeys = (data ?? []).map((p) => ({
				id: p.id,
				name: p.name ?? null,
				createdAt: p.createdAt ? p.createdAt.toISOString() : null
			}));
		} catch {
			passkeys = [];
		} finally {
			isLoading = false;
		}
	}

	async function handleAddPasskey() {
		if (isAdding || !isSupported) return;

		isAdding = true;
		try {
			const { error } = await authClient.passkey.addPasskey();
			if (error) {
				throw error;
			}
			toastStore.success(m.settings_passkey_add_success());
			await loadPasskeys();
		} catch {
			toastStore.error(m.settings_passkey_add_error());
		} finally {
			isAdding = false;
		}
	}

	function openDeleteDialog(passkey: Passkey) {
		deleteTarget = passkey;
	}

	function closeDeleteDialog() {
		deleteTarget = null;
	}

	async function confirmDelete() {
		if (!deleteTarget || isDeleting) return;

		isDeleting = true;
		try {
			const { error } = await authClient.passkey.deletePasskey({
				id: deleteTarget.id
			});
			if (error) {
				throw error;
			}
			toastStore.success(m.settings_passkey_delete_success());
			await loadPasskeys();
		} catch {
			toastStore.error(m.settings_passkey_delete_error());
		} finally {
			isDeleting = false;
			deleteTarget = null;
		}
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<section aria-labelledby="passkey-section" class="passkey-settings">
	<div class="settings-card">
		<SettingsGroupTitle
			title={m.settings_passkey_section()}
			desc={m.settings_passkey_description()}
			id="passkey-section"
		/>

		<div class="passkey-content">
			{#if !isSupported}
				<p class="passkey-unsupported">{m.settings_passkey_add_not_supported()}</p>
			{:else if isLoading}
				<p class="passkey-loading">{m.common_loading()}</p>
			{:else if passkeys.length === 0}
				<div class="passkey-empty">
					<p class="passkey-empty-title">{m.settings_passkey_empty()}</p>
					<p class="passkey-empty-message">{m.settings_passkey_empty_message()}</p>
				</div>
			{:else}
				<SettingsGrid>
					{#each passkeys as passkey (passkey.id)}
						<SettingsRow>
							{#snippet label()}
								<div class="passkey-item">
									<Icon><Key /></Icon>
									<div class="passkey-info">
										<span class="passkey-name"
											>{passkey.name || m.settings_passkey_name_fallback()}</span
										>
										{#if passkey.createdAt}
											<span class="passkey-date">
												{m.settings_passkey_registered({ date: formatDate(passkey.createdAt) })}
											</span>
										{/if}
									</div>
								</div>
							{/snippet}
							{#snippet control()}
								<IconButton
									tooltip={m.settings_passkey_delete_button()}
									aria-label={m.settings_passkey_delete_button()}
									onclick={() => openDeleteDialog(passkey)}
									noBackground
								>
									<Icon><Trash /></Icon>
								</IconButton>
							{/snippet}
						</SettingsRow>
					{/each}
				</SettingsGrid>
			{/if}

			{#if isSupported}
				<div class="passkey-actions">
					<Button
						variant="secondary"
						size="small"
						onclick={handleAddPasskey}
						isLoading={isAdding}
						disabled={isAdding}
					>
						<Icon><Add /></Icon>
						{m.settings_passkey_add_button()}
					</Button>
				</div>
			{/if}
		</div>
	</div>

	{#if deleteTarget}
		<Modal
			title={m.settings_passkey_delete_title()}
			description={m.settings_passkey_delete_confirm()}
			onClose={closeDeleteDialog}
		>
			<div class="delete-modal-actions">
				<Button variant="ghost" size="small" onclick={closeDeleteDialog} disabled={isDeleting}>
					{m.common_cancel()}
				</Button>
				<Button
					variant="danger"
					size="small"
					onclick={confirmDelete}
					isLoading={isDeleting}
					disabled={isDeleting}
				>
					{m.settings_passkey_delete_button()}
				</Button>
			</div>
		</Modal>
	{/if}
</section>

<style>
	.passkey-settings {
		display: flex;
		flex-direction: column;
	}

	.passkey-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.passkey-empty {
		padding: var(--spacing-4);
		text-align: center;
	}

	.passkey-empty-title {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.passkey-empty-message {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.passkey-unsupported,
	.passkey-loading {
		padding: var(--spacing-3);
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.passkey-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.passkey-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-0-5);
	}

	.passkey-name {
		font-size: var(--font-size-base);
		color: var(--text-normal);
	}

	.passkey-date {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.passkey-actions {
		display: flex;
		justify-content: flex-start;
		padding-top: var(--spacing-2);
	}

	.delete-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
		padding-top: var(--spacing-3);
	}
</style>
