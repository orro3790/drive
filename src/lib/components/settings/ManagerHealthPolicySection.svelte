<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { driverHealthSettingsSchema } from '$lib/schemas/dispatch-settings';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';

	let rewardMinAttendancePercent = $state('95');
	let baselineRewardMinAttendancePercent = $state('95');
	let correctiveCompletionThresholdPercent = $state('98');
	let baselineCorrectiveCompletionThresholdPercent = $state('98');
	let attendanceFieldError = $state<string | null>(null);
	let completionFieldError = $state<string | null>(null);
	let isLoading = $state(false);
	let isSaving = $state(false);
	let canEditDriverHealthSettings = $state(false);

	const hasAttendanceChanges = $derived(
		rewardMinAttendancePercent.trim() !== baselineRewardMinAttendancePercent.trim()
	);
	const hasCompletionChanges = $derived(
		correctiveCompletionThresholdPercent.trim() !==
			baselineCorrectiveCompletionThresholdPercent.trim()
	);

	function parsePercent(value: string): number | null {
		const normalized = value.trim();
		if (normalized.length === 0) {
			return null;
		}

		const parsed = Number(normalized);
		if (!Number.isInteger(parsed)) {
			return null;
		}

		if (parsed < 0 || parsed > 100) {
			return null;
		}

		return parsed;
	}

	function validationErrorMessage() {
		return m.settings_manager_health_validation_error();
	}

	async function loadSettings() {
		isLoading = true;
		attendanceFieldError = null;
		completionFieldError = null;
		canEditDriverHealthSettings = false;

		try {
			const response = await fetch('/api/settings/dispatch');
			if (!response.ok) {
				throw new Error('load_failed');
			}

			const payload = (await response.json()) as {
				settings?: {
					rewardMinAttendancePercent?: unknown;
					correctiveCompletionThresholdPercent?: unknown;
				};
				permissions?: { canEditDriverHealthSettings?: unknown };
			};

			const parsed = driverHealthSettingsSchema.safeParse({
				rewardMinAttendancePercent: payload.settings?.rewardMinAttendancePercent,
				correctiveCompletionThresholdPercent: payload.settings?.correctiveCompletionThresholdPercent
			});

			if (!parsed.success) {
				throw new Error('invalid_payload');
			}

			canEditDriverHealthSettings = payload.permissions?.canEditDriverHealthSettings === true;
			rewardMinAttendancePercent = String(parsed.data.rewardMinAttendancePercent);
			baselineRewardMinAttendancePercent = String(parsed.data.rewardMinAttendancePercent);
			correctiveCompletionThresholdPercent = String(
				parsed.data.correctiveCompletionThresholdPercent
			);
			baselineCorrectiveCompletionThresholdPercent = String(
				parsed.data.correctiveCompletionThresholdPercent
			);
		} catch {
			toastStore.error(m.settings_dispatch_load_error());
		} finally {
			isLoading = false;
		}
	}

	async function saveSettings(patch: {
		rewardMinAttendancePercent?: number;
		correctiveCompletionThresholdPercent?: number;
	}) {
		if (!canEditDriverHealthSettings || isLoading || isSaving) {
			return;
		}

		isSaving = true;

		try {
			const response = await fetch('/api/settings/dispatch', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});

			const payload = (await response.json().catch(() => ({}))) as {
				message?: string;
				settings?: {
					rewardMinAttendancePercent?: unknown;
					correctiveCompletionThresholdPercent?: unknown;
				};
			};

			if (!response.ok) {
				const message = payload.message ?? m.settings_dispatch_save_error();
				if (patch.rewardMinAttendancePercent !== undefined) {
					attendanceFieldError = message;
				}
				if (patch.correctiveCompletionThresholdPercent !== undefined) {
					completionFieldError = message;
				}
				return;
			}

			const parsed = driverHealthSettingsSchema.safeParse({
				rewardMinAttendancePercent: payload.settings?.rewardMinAttendancePercent,
				correctiveCompletionThresholdPercent: payload.settings?.correctiveCompletionThresholdPercent
			});

			if (!parsed.success) {
				throw new Error('invalid_payload');
			}

			rewardMinAttendancePercent = String(parsed.data.rewardMinAttendancePercent);
			baselineRewardMinAttendancePercent = String(parsed.data.rewardMinAttendancePercent);
			correctiveCompletionThresholdPercent = String(
				parsed.data.correctiveCompletionThresholdPercent
			);
			baselineCorrectiveCompletionThresholdPercent = String(
				parsed.data.correctiveCompletionThresholdPercent
			);
			attendanceFieldError = null;
			completionFieldError = null;
			toastStore.success(m.settings_dispatch_save_success());
		} catch {
			toastStore.error(m.settings_dispatch_save_error());
		} finally {
			isSaving = false;
		}
	}

	async function saveAttendance(nextValue?: string) {
		if (typeof nextValue === 'string') {
			rewardMinAttendancePercent = nextValue;
		}

		if (!hasAttendanceChanges) {
			return;
		}

		const parsed = parsePercent(rewardMinAttendancePercent);
		if (parsed === null) {
			attendanceFieldError = validationErrorMessage();
			return;
		}

		attendanceFieldError = null;
		await saveSettings({ rewardMinAttendancePercent: parsed });
	}

	async function saveCompletion(nextValue?: string) {
		if (typeof nextValue === 'string') {
			correctiveCompletionThresholdPercent = nextValue;
		}

		if (!hasCompletionChanges) {
			return;
		}

		const parsed = parsePercent(correctiveCompletionThresholdPercent);
		if (parsed === null) {
			completionFieldError = validationErrorMessage();
			return;
		}

		completionFieldError = null;
		await saveSettings({ correctiveCompletionThresholdPercent: parsed });
	}

	onMount(() => {
		void loadSettings();
	});
</script>

<section aria-labelledby="manager-health-policy-section" class="manager-health-policy-stack">
	<div class="settings-card">
		<SettingsGroupTitle
			title={m.settings_manager_health_title()}
			desc={m.settings_manager_health_description()}
			id="manager-health-policy-section"
		/>
		<p class="caution-note">{m.settings_manager_health_caution_note()}</p>
		<SettingsGrid>
			<SettingsRow ariaDisabled={isLoading || isSaving}>
				{#snippet label()}
					<div class="title">{m.settings_manager_health_attendance_title()}</div>
					<div class="desc">{m.settings_manager_health_attendance_description()}</div>
				{/snippet}
				{#snippet control()}
					<div class="health-control-row" class:readonly={!canEditDriverHealthSettings}>
						{#if canEditDriverHealthSettings}
							<InlineEditor
								id="settings-health-attendance-threshold"
								name="settings-health-attendance-threshold"
								size="small"
								value={rewardMinAttendancePercent}
								inputType="number"
								inputmode="numeric"
								min={0}
								max={100}
								placeholder={m.settings_manager_health_attendance_placeholder()}
								ariaLabel={m.settings_manager_health_attendance_aria_label()}
								disabled={isLoading || isSaving}
								hasError={Boolean(attendanceFieldError)}
								onInput={(value) => {
									rewardMinAttendancePercent = value;
									attendanceFieldError = null;
								}}
								onSave={(value) => {
									void saveAttendance(value);
								}}
							/>
							<span class="percent-symbol">%</span>
						{:else}
							<div class="health-readonly-value">{rewardMinAttendancePercent}%</div>
						{/if}
					</div>
				{/snippet}
				{#snippet children()}
					{#if canEditDriverHealthSettings && attendanceFieldError}
						<p class="field-error" role="alert">{attendanceFieldError}</p>
					{/if}
				{/snippet}
			</SettingsRow>

			<SettingsRow ariaDisabled={isLoading || isSaving}>
				{#snippet label()}
					<div class="title">{m.settings_manager_health_completion_title()}</div>
					<div class="desc">{m.settings_manager_health_completion_description()}</div>
				{/snippet}
				{#snippet control()}
					<div class="health-control-row" class:readonly={!canEditDriverHealthSettings}>
						{#if canEditDriverHealthSettings}
							<InlineEditor
								id="settings-health-completion-threshold"
								name="settings-health-completion-threshold"
								size="small"
								value={correctiveCompletionThresholdPercent}
								inputType="number"
								inputmode="numeric"
								min={0}
								max={100}
								placeholder={m.settings_manager_health_completion_placeholder()}
								ariaLabel={m.settings_manager_health_completion_aria_label()}
								disabled={isLoading || isSaving}
								hasError={Boolean(completionFieldError)}
								onInput={(value) => {
									correctiveCompletionThresholdPercent = value;
									completionFieldError = null;
								}}
								onSave={(value) => {
									void saveCompletion(value);
								}}
							/>
							<span class="percent-symbol">%</span>
						{:else}
							<div class="health-readonly-value">{correctiveCompletionThresholdPercent}%</div>
						{/if}
					</div>
				{/snippet}
				{#snippet children()}
					{#if canEditDriverHealthSettings && completionFieldError}
						<p class="field-error" role="alert">{completionFieldError}</p>
					{/if}
				{/snippet}
			</SettingsRow>
		</SettingsGrid>
	</div>
</section>

<style>
	.manager-health-policy-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.caution-note {
		margin: 0 0 var(--spacing-2) 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.health-control-row {
		display: grid;
		grid-template-columns: minmax(96px, 120px) auto;
		align-items: center;
		gap: var(--spacing-2);
		width: auto;
	}

	.health-control-row.readonly {
		display: flex;
		justify-content: flex-end;
		width: 100%;
	}

	.percent-symbol {
		display: inline-flex;
		align-items: center;
		justify-self: start;
		font-size: var(--font-size-base);
		color: var(--text-muted);
	}

	.health-readonly-value {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		text-align: right;
	}

	/* On mobile (when control wraps to its own line), left-align readonly values */
	@container (max-width: 620px) {
		.health-control-row.readonly {
			justify-content: flex-start;
		}

		.health-readonly-value {
			text-align: left;
		}
	}

	.field-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}
</style>
