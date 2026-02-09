<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	import Button from '$lib/components/primitives/Button.svelte';
	import Chip, { type ChipStatus } from '$lib/components/primitives/Chip.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';

	type OnboardingKind = 'approval' | 'invite';
	type OnboardingStatus = 'pending' | 'consumed' | 'revoked';
	type OnboardingResolvedStatus = OnboardingStatus | 'expired';

	interface OnboardingEntry {
		id: string;
		email: string;
		kind: OnboardingKind;
		status: OnboardingStatus;
		resolvedStatus: OnboardingResolvedStatus;
		createdBy: string | null;
		createdAt: string;
		expiresAt: string | null;
		consumedAt: string | null;
		consumedByUserId: string | null;
		revokedAt: string | null;
		revokedByUserId: string | null;
		updatedAt: string;
	}

	const inviteExpiryOptions = [
		{ value: 24, label: m.settings_onboarding_invite_expiry_24h() },
		{ value: 72, label: m.settings_onboarding_invite_expiry_72h() },
		{ value: 168, label: m.settings_onboarding_invite_expiry_7d() }
	];

	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	let entries = $state<OnboardingEntry[]>([]);
	let isLoading = $state(false);
	let isCreatingApproval = $state(false);
	let isCreatingInvite = $state(false);
	let revokingEntryIds = $state<Record<string, boolean>>({});

	let approvalEmail = $state('');
	let inviteEmail = $state('');
	let inviteExpiresInHours = $state<number>(168);

	let latestInviteCode = $state<string | null>(null);
	let latestInviteEmail = $state<string | null>(null);

	onMount(() => {
		void loadEntries();
	});

	function normalizeEmail(email: string): string {
		return email.trim().toLowerCase();
	}

	function formatTimestamp(value: string | null): string {
		if (!value) {
			return m.settings_onboarding_not_set();
		}

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return m.settings_onboarding_not_set();
		}

		return dateFormatter.format(date);
	}

	function formatActor(value: string | null): string {
		return value ?? m.settings_onboarding_not_set();
	}

	function kindLabel(kind: OnboardingKind): string {
		return kind === 'invite'
			? m.settings_onboarding_kind_invite()
			: m.settings_onboarding_kind_approval();
	}

	function statusLabel(status: OnboardingResolvedStatus): string {
		switch (status) {
			case 'consumed':
				return m.settings_onboarding_status_consumed();
			case 'revoked':
				return m.settings_onboarding_status_revoked();
			case 'expired':
				return m.settings_onboarding_status_expired();
			default:
				return m.settings_onboarding_status_pending();
		}
	}

	function statusTone(status: OnboardingResolvedStatus): ChipStatus {
		switch (status) {
			case 'consumed':
				return 'success';
			case 'revoked':
				return 'error';
			case 'expired':
				return 'warning';
			default:
				return 'info';
		}
	}

	async function loadEntries() {
		isLoading = true;
		try {
			const res = await fetch('/api/onboarding');
			if (!res.ok) {
				throw new Error('onboarding-load-failed');
			}

			const payload = (await res.json()) as { entries?: OnboardingEntry[] };
			entries = payload.entries ?? [];
		} catch {
			toastStore.error(m.settings_onboarding_request_error());
		} finally {
			isLoading = false;
		}
	}

	async function createApproval() {
		if (isCreatingApproval) {
			return;
		}

		const email = normalizeEmail(approvalEmail);
		if (!email) {
			return;
		}

		isCreatingApproval = true;
		try {
			const res = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					kind: 'approval',
					email
				})
			});

			if (res.status === 409) {
				toastStore.error(m.settings_onboarding_entry_exists());
				return;
			}

			if (!res.ok) {
				throw new Error('approval-create-failed');
			}

			approvalEmail = '';
			await loadEntries();
			toastStore.success(m.settings_onboarding_create_success());
		} catch {
			toastStore.error(m.settings_onboarding_request_error());
		} finally {
			isCreatingApproval = false;
		}
	}

	async function createInvite() {
		if (isCreatingInvite) {
			return;
		}

		const email = normalizeEmail(inviteEmail);
		if (!email) {
			return;
		}

		isCreatingInvite = true;
		try {
			const res = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					kind: 'invite',
					email,
					expiresInHours: inviteExpiresInHours
				})
			});

			if (res.status === 409) {
				toastStore.error(m.settings_onboarding_entry_exists());
				return;
			}

			if (!res.ok) {
				throw new Error('invite-create-failed');
			}

			const payload = (await res.json()) as { inviteCode?: string };
			if (payload.inviteCode) {
				latestInviteCode = payload.inviteCode;
				latestInviteEmail = email;
			}

			inviteEmail = '';
			await loadEntries();
			toastStore.success(m.settings_onboarding_invite_success());
		} catch {
			toastStore.error(m.settings_onboarding_request_error());
		} finally {
			isCreatingInvite = false;
		}
	}

	async function revokeEntry(entryId: string) {
		if (revokingEntryIds[entryId]) {
			return;
		}

		revokingEntryIds = {
			...revokingEntryIds,
			[entryId]: true
		};

		try {
			const res = await fetch(`/api/onboarding/${entryId}/revoke`, {
				method: 'PATCH'
			});
			if (!res.ok) {
				throw new Error('revoke-failed');
			}

			await loadEntries();
			toastStore.success(m.settings_onboarding_revoke_success());
		} catch {
			toastStore.error(m.settings_onboarding_revoke_error());
		} finally {
			const next = { ...revokingEntryIds };
			delete next[entryId];
			revokingEntryIds = next;
		}
	}

	async function copyInviteCode() {
		if (!latestInviteCode) {
			return;
		}

		try {
			await navigator.clipboard.writeText(latestInviteCode);
			toastStore.success(m.settings_onboarding_copy_success());
		} catch {
			toastStore.error(m.settings_onboarding_copy_error());
		}
	}
</script>

<section aria-labelledby="manager-onboarding-section" class="manager-onboarding-stack">
	<div class="settings-card">
		<SettingsGroupTitle
			title={m.settings_onboarding_section()}
			desc={m.settings_onboarding_description()}
			id="manager-onboarding-section"
		/>
		<SettingsGrid>
			<SettingsRow ariaDisabled={isCreatingApproval}>
				{#snippet label()}
					<div class="title">{m.settings_onboarding_approvals_title()}</div>
					<div class="desc">{m.settings_onboarding_approvals_desc()}</div>
				{/snippet}
				{#snippet control()}
					<div class="inline-form-row">
						<InlineEditor
							id="settings-onboarding-approval-email"
							name="settings-onboarding-approval-email"
							size="small"
							value={approvalEmail}
							inputType="email"
							placeholder={m.settings_onboarding_approval_input_placeholder()}
							ariaLabel={m.settings_onboarding_approval_input_label()}
							autocomplete="email"
							disabled={isCreatingApproval}
							onInput={(value) => {
								approvalEmail = value;
							}}
							variant="bordered"
						/>
						<Button
							type="button"
							size="small"
							onclick={createApproval}
							disabled={isCreatingApproval || normalizeEmail(approvalEmail).length === 0}
							isLoading={isCreatingApproval}
						>
							{m.settings_onboarding_approve_button()}
						</Button>
					</div>
				{/snippet}
			</SettingsRow>

			<SettingsRow ariaDisabled={isCreatingInvite}>
				{#snippet label()}
					<div class="title">{m.settings_onboarding_invite_title()}</div>
					<div class="desc">{m.settings_onboarding_invite_desc()}</div>
				{/snippet}
				{#snippet control()}
					<div class="invite-form-row">
						<InlineEditor
							id="settings-onboarding-invite-email"
							name="settings-onboarding-invite-email"
							size="small"
							value={inviteEmail}
							inputType="email"
							placeholder={m.settings_onboarding_invite_input_placeholder()}
							ariaLabel={m.settings_onboarding_invite_input_label()}
							autocomplete="email"
							disabled={isCreatingInvite}
							onInput={(value) => {
								inviteEmail = value;
							}}
							variant="bordered"
						/>
						<Combobox
							size="sm"
							options={inviteExpiryOptions}
							value={inviteExpiresInHours}
							onChange={(value) => {
								inviteExpiresInHours = Number(value);
							}}
							aria-label={m.settings_onboarding_invite_expiry_label()}
							disabled={isCreatingInvite}
						/>
						<Button
							type="button"
							size="small"
							onclick={createInvite}
							disabled={isCreatingInvite || normalizeEmail(inviteEmail).length === 0}
							isLoading={isCreatingInvite}
						>
							{m.settings_onboarding_invite_button()}
						</Button>
					</div>
				{/snippet}
			</SettingsRow>
		</SettingsGrid>

		{#if latestInviteCode}
			<div class="latest-invite">
				<div class="latest-invite-title">{m.settings_onboarding_latest_invite_title()}</div>
				<div class="latest-invite-code-row">
					<code>{latestInviteCode}</code>
					<Button type="button" size="small" variant="secondary" onclick={copyInviteCode}>
						{m.settings_onboarding_copy_code_button()}
					</Button>
				</div>
				{#if latestInviteEmail}
					<div class="latest-invite-hint">{latestInviteEmail}</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="settings-card">
		<SettingsGroupTitle
			title={m.settings_onboarding_list_title()}
			desc={m.settings_onboarding_list_desc()}
		/>

		{#if isLoading}
			<p class="empty-state">{m.common_loading()}</p>
		{:else if entries.length === 0}
			<p class="empty-state">{m.settings_onboarding_empty_state()}</p>
		{:else}
			<div class="entry-list" role="list">
				{#each entries as entry (entry.id)}
					<article class="entry-row" role="listitem">
						<div class="entry-header">
							<div class="entry-email">{entry.email}</div>
							<div class="entry-badges">
								<Chip
									variant="status"
									label={kindLabel(entry.kind)}
									status="neutral"
									ariaLabel={m.settings_onboarding_entry_type_label()}
								/>
								<Chip
									variant="status"
									label={statusLabel(entry.resolvedStatus)}
									status={statusTone(entry.resolvedStatus)}
									ariaLabel={m.settings_onboarding_entry_status_label()}
								/>
							</div>
						</div>

						<div class="entry-details">
							<div>
								<strong>{m.settings_onboarding_created_at_label()}</strong>
								<span>{formatTimestamp(entry.createdAt)}</span>
							</div>
							<div>
								<strong>{m.settings_onboarding_created_by_label()}</strong>
								<span>{formatActor(entry.createdBy)}</span>
							</div>
							<div>
								<strong>{m.settings_onboarding_expires_at_label()}</strong>
								<span>{formatTimestamp(entry.expiresAt)}</span>
							</div>
							<div>
								<strong>{m.settings_onboarding_consumed_at_label()}</strong>
								<span>{formatTimestamp(entry.consumedAt)}</span>
							</div>
							<div>
								<strong>{m.settings_onboarding_consumed_by_label()}</strong>
								<span>{formatActor(entry.consumedByUserId)}</span>
							</div>
							<div>
								<strong>{m.settings_onboarding_revoked_at_label()}</strong>
								<span>{formatTimestamp(entry.revokedAt)}</span>
							</div>
							<div>
								<strong>{m.settings_onboarding_revoked_by_label()}</strong>
								<span>{formatActor(entry.revokedByUserId)}</span>
							</div>
						</div>

						{#if entry.status === 'pending'}
							<div class="entry-actions">
								<Button
									type="button"
									size="small"
									variant="secondary"
									onclick={() => revokeEntry(entry.id)}
									isLoading={Boolean(revokingEntryIds[entry.id])}
									disabled={Boolean(revokingEntryIds[entry.id])}
								>
									{m.settings_onboarding_revoke_button()}
								</Button>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.manager-onboarding-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.inline-form-row,
	.invite-form-row {
		display: grid;
		align-items: center;
		gap: var(--spacing-2);
		width: 100%;
	}

	.inline-form-row {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.invite-form-row {
		grid-template-columns: minmax(0, 1fr) 168px auto;
	}

	.latest-invite {
		margin-top: var(--spacing-3);
		padding: var(--spacing-3);
		border: 1px dashed var(--border-primary);
		border-radius: var(--radius-base);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.latest-invite-title {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.latest-invite-code-row {
		display: flex;
		gap: var(--spacing-2);
		align-items: center;
		flex-wrap: wrap;
	}

	.latest-invite-code-row code {
		font-family: var(--font-family-mono);
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-sm);
		background: var(--surface-muted);
		word-break: break-all;
	}

	.latest-invite-hint {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.empty-state {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.entry-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.entry-row {
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		padding: var(--spacing-3);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		background: var(--surface-primary);
	}

	.entry-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-2);
		flex-wrap: wrap;
	}

	.entry-email {
		font-weight: var(--font-weight-medium);
		font-size: var(--font-size-base);
		color: var(--text-normal);
		word-break: break-all;
	}

	.entry-badges {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		flex-wrap: wrap;
	}

	.entry-details {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--spacing-2) var(--spacing-3);
	}

	.entry-details div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.entry-details strong {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.entry-details span {
		font-size: var(--font-size-sm);
		color: var(--text-normal);
		word-break: break-word;
	}

	.entry-actions {
		display: flex;
		justify-content: flex-end;
	}

	@media (max-width: 980px) {
		.invite-form-row {
			grid-template-columns: minmax(0, 1fr);
		}

		.entry-details {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 767px) {
		.inline-form-row {
			grid-template-columns: minmax(0, 1fr);
		}

		.entry-actions {
			justify-content: flex-start;
		}
	}
</style>
