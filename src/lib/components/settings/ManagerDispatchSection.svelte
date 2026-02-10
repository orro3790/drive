<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { dispatchSettingsSchema } from '$lib/schemas/dispatch-settings';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';

	let emergencyBonusPercent = $state('20');
	let baselineBonusPercent = $state('20');
	let fieldError = $state<string | null>(null);
	let isLoading = $state(false);
	let isSaving = $state(false);

	const hasChanges = $derived(emergencyBonusPercent.trim() !== baselineBonusPercent.trim());

	function normalizeInputValue(value: string): string {
		return value.trim();
	}

	function parseBonusPercent(value: string): number | null {
		const normalized = normalizeInputValue(value);
		if (normalized.length === 0) {
			fieldError = m.settings_dispatch_bonus_range_error();
			return null;
		}

		const parsedValue = Number(normalized);
		if (!Number.isInteger(parsedValue)) {
			fieldError = m.settings_dispatch_bonus_integer_error();
			return null;
		}

		const parsed = dispatchSettingsSchema.safeParse({ emergencyBonusPercent: parsedValue });
		if (!parsed.success) {
			fieldError = m.settings_dispatch_bonus_range_error();
			return null;
		}

		return parsed.data.emergencyBonusPercent;
	}

	async function loadSettings() {
		isLoading = true;
		fieldError = null;

		try {
			const response = await fetch('/api/settings/dispatch');
			if (!response.ok) {
				throw new Error('load_failed');
			}

			const payload = (await response.json()) as {
				settings?: { emergencyBonusPercent?: unknown };
			};

			const parsed = dispatchSettingsSchema.safeParse({
				emergencyBonusPercent: payload.settings?.emergencyBonusPercent
			});

			if (!parsed.success) {
				throw new Error('invalid_payload');
			}

			const nextValue = String(parsed.data.emergencyBonusPercent);
			emergencyBonusPercent = nextValue;
			baselineBonusPercent = nextValue;
		} catch {
			toastStore.error(m.settings_dispatch_load_error());
		} finally {
			isLoading = false;
		}
	}

	async function saveSettings(nextValue?: string) {
		if (typeof nextValue === 'string') {
			emergencyBonusPercent = nextValue;
		}

		if (isSaving || isLoading || !hasChanges) {
			return;
		}

		const parsedBonus = parseBonusPercent(emergencyBonusPercent);
		if (parsedBonus === null) {
			return;
		}

		isSaving = true;

		try {
			const response = await fetch('/api/settings/dispatch', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ emergencyBonusPercent: parsedBonus })
			});

			const payload = (await response.json().catch(() => ({}))) as {
				message?: string;
				settings?: { emergencyBonusPercent?: unknown };
			};

			if (!response.ok) {
				fieldError = payload.message ?? m.settings_dispatch_save_error();
				return;
			}

			const parsed = dispatchSettingsSchema.safeParse({
				emergencyBonusPercent: payload.settings?.emergencyBonusPercent
			});

			if (!parsed.success) {
				throw new Error('invalid_payload');
			}

			const nextValue = String(parsed.data.emergencyBonusPercent);
			emergencyBonusPercent = nextValue;
			baselineBonusPercent = nextValue;
			fieldError = null;
			toastStore.success(m.settings_dispatch_save_success());
		} catch {
			toastStore.error(m.settings_dispatch_save_error());
		} finally {
			isSaving = false;
		}
	}

	onMount(() => {
		void loadSettings();
	});
</script>

<section aria-labelledby="manager-dispatch-section" class="manager-dispatch-stack">
	<div class="settings-card">
		<SettingsGroupTitle
			title={m.settings_dispatch_section()}
			desc={m.settings_dispatch_description()}
			id="manager-dispatch-section"
		/>
		<SettingsGrid>
			<SettingsRow ariaDisabled={isLoading || isSaving}>
				{#snippet label()}
					<div class="title">{m.settings_dispatch_bonus_label()}</div>
					<div class="desc">{m.settings_dispatch_bonus_description()}</div>
				{/snippet}
				{#snippet control()}
					<div class="dispatch-control-row">
						<InlineEditor
							id="settings-dispatch-urgent-bonus"
							name="settings-dispatch-urgent-bonus"
							size="small"
							value={emergencyBonusPercent}
							inputType="number"
							inputmode="numeric"
							min={0}
							max={100}
							placeholder="20"
							ariaLabel={m.settings_dispatch_bonus_label()}
							disabled={isLoading || isSaving}
							hasError={Boolean(fieldError)}
							onInput={(value) => {
								emergencyBonusPercent = value;
								fieldError = null;
							}}
							onSave={(value) => {
								void saveSettings(value);
							}}
						/>
						<span class="percent-symbol">%</span>
					</div>
				{/snippet}
				{#snippet children()}
					{#if fieldError}
						<p class="field-error" role="alert">{fieldError}</p>
					{/if}
				{/snippet}
			</SettingsRow>
		</SettingsGrid>
	</div>
</section>

<style>
	.manager-dispatch-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.dispatch-control-row {
		display: grid;
		grid-template-columns: minmax(96px, 120px) auto;
		align-items: center;
		gap: var(--spacing-2);
		width: auto;
	}

	.percent-symbol {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		font-size: var(--font-size-base);
		color: var(--text-muted);
	}

	.field-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}
</style>
