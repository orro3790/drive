<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';

	import Button from '$lib/components/primitives/Button.svelte';
	import Chip, { type ChipStatus } from '$lib/components/primitives/Chip.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';

	type OnboardingKind = 'approval' | 'invite';
	type OnboardingStatus = 'pending' | 'consumed' | 'revoked';
	type OnboardingDisplayStatus = 'pending' | 'onboarded';

	interface OnboardingEntry {
		id: string;
		email: string;
		kind: OnboardingKind;
		status: OnboardingStatus;
		createdBy: string | null;
		createdAt: string;
	}

	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	let entries = $state<OnboardingEntry[]>([]);
	let isLoading = $state(false);
	let isCreatingApproval = $state(false);

	let approvalEmail = $state('');
	const approvalEntries = $derived(
		entries.filter(
			(entry) =>
				entry.kind === 'approval' && (entry.status === 'pending' || entry.status === 'consumed')
		)
	);

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

	function displayStatus(status: OnboardingStatus): OnboardingDisplayStatus {
		return status === 'consumed' ? 'onboarded' : 'pending';
	}

	function statusLabel(status: OnboardingDisplayStatus): string {
		return status === 'onboarded'
			? m.settings_onboarding_status_onboarded()
			: m.settings_onboarding_status_pending();
	}

	function statusTone(status: OnboardingDisplayStatus): ChipStatus {
		return status === 'onboarded' ? 'success' : 'neutral';
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
		</SettingsGrid>
	</div>

	<div class="settings-card">
		<SettingsGroupTitle
			title={m.settings_onboarding_list_title()}
			desc={m.settings_onboarding_list_desc()}
		/>

		{#if isLoading}
			<p class="empty-state">{m.common_loading()}</p>
		{:else if approvalEntries.length === 0}
			<p class="empty-state">{m.settings_onboarding_empty_state()}</p>
		{:else}
			<div class="entry-list" role="list">
				{#each approvalEntries as entry (entry.id)}
					<article class="entry-row" role="listitem">
						<div class="entry-header">
							<div class="entry-email">{entry.email}</div>
							<Chip
								variant="status"
								label={statusLabel(displayStatus(entry.status))}
								status={statusTone(displayStatus(entry.status))}
								ariaLabel={m.settings_onboarding_entry_status_label()}
							/>
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
						</div>
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

	.inline-form-row {
		display: grid;
		align-items: center;
		gap: var(--spacing-2);
		width: 100%;
		grid-template-columns: minmax(0, 1fr) auto;
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

	@media (max-width: 980px) {
		.entry-details {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 767px) {
		.inline-form-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
