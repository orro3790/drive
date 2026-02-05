<!--
@component
AccountSection - Account details section for settings page.
Displays and updates user's account info, password, and preferences.
-->
<script lang="ts">
	import { z, type ZodIssue } from 'zod';
	import * as m from '$lib/paraglide/messages.js';
	import SettingsGroupTitle from './SettingsGroupTitle.svelte';
	import SettingsGrid from './SettingsGrid.svelte';
	import SettingsRow from './SettingsRow.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Eye from '$lib/components/icons/Eye.svelte';
	import EyeOff from '$lib/components/icons/EyeOff.svelte';
	import DriverPreferencesSection from './DriverPreferencesSection.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { User } from '$lib/types/user';
	import { userProfileUpdateSchema } from '$lib/schemas/user-settings';

	let { user }: { user: User | null } = $props();

	type AccountErrors = Partial<Record<'name' | 'email' | 'phone', string[]>>;
	type PasswordErrors = Partial<Record<'current' | 'next' | 'confirm', string[]>>;

	let accountForm = $state({
		name: '',
		email: '',
		phone: ''
	});
	let accountBaseline = $state({
		name: '',
		email: '',
		phone: ''
	});
	let accountErrors = $state<AccountErrors>({});
	let isAccountSaving = $state(false);

	let passwordForm = $state({
		current: '',
		next: '',
		confirm: ''
	});
	let passwordErrors = $state<PasswordErrors>({});
	let isPasswordSaving = $state(false);
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let showConfirmPassword = $state(false);

	const roleLabel = $derived(
		user?.role === 'manager' ? m.settings_account_role_manager() : m.settings_account_role_driver()
	);

	const hasAccountChanges = $derived.by(() => {
		return (
			accountForm.name.trim() !== accountBaseline.name ||
			accountForm.email.trim().toLowerCase() !== accountBaseline.email.toLowerCase() ||
			accountForm.phone.trim() !== accountBaseline.phone.trim()
		);
	});

	const passwordFormSchema = z.object({
		currentPassword: z.string().min(1),
		newPassword: z.string().min(8),
		confirmPassword: z.string().min(1)
	});

	$effect(() => {
		if (!user) return;
		accountForm = {
			name: user.name ?? '',
			email: user.email ?? '',
			phone: user.phone ?? ''
		};
		accountBaseline = { ...accountForm };
		accountErrors = {};
	});

	function clearAccountError(field: keyof AccountErrors) {
		if (!accountErrors[field]) return;
		accountErrors = { ...accountErrors, [field]: undefined };
	}

	function clearPasswordError(field: keyof PasswordErrors) {
		if (!passwordErrors[field]) return;
		passwordErrors = { ...passwordErrors, [field]: undefined };
	}

	function resetAccountForm() {
		accountForm = { ...accountBaseline };
		accountErrors = {};
	}

	function applyAccountErrors(issues: ZodIssue[]) {
		const nextErrors: AccountErrors = {};
		for (const issue of issues) {
			const field = issue.path[0];
			if (field === 'name') {
				nextErrors.name = [m.settings_account_name_required()];
			}
			if (field === 'email') {
				if (issue.code === 'invalid_format' && issue.format === 'email') {
					nextErrors.email = [m.settings_account_email_invalid()];
				} else {
					nextErrors.email = [m.settings_account_email_required()];
				}
			}
			if (field === 'phone') {
				nextErrors.phone = [m.settings_account_phone_invalid()];
			}
		}
		accountErrors = nextErrors;
	}

	function applyPasswordErrors(issues: ZodIssue[]) {
		const nextErrors: PasswordErrors = {};
		for (const issue of issues) {
			const field = issue.path[0];
			if (field === 'currentPassword') {
				nextErrors.current = [m.settings_password_current_required()];
			}
			if (field === 'newPassword') {
				nextErrors.next = [m.settings_password_min_length()];
			}
			if (field === 'confirmPassword') {
				nextErrors.confirm = [m.settings_password_confirm_required()];
			}
		}
		passwordErrors = nextErrors;
	}

	async function handleAccountSave() {
		if (!user || isAccountSaving || !hasAccountChanges) return;

		accountErrors = {};
		const payload = {
			name: accountForm.name.trim(),
			email: accountForm.email.trim().toLowerCase(),
			phone: accountForm.phone.trim() || null
		};

		const result = userProfileUpdateSchema.safeParse(payload);
		if (!result.success) {
			applyAccountErrors(result.error.issues);
			return;
		}

		const previous = { ...accountBaseline };
		accountBaseline = {
			name: payload.name,
			email: payload.email,
			phone: payload.phone ?? ''
		};
		accountForm = { ...accountBaseline };
		isAccountSaving = true;

		try {
			const res = await fetch('/api/users/me', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (res.status === 409 && data?.error === 'email_taken') {
					accountErrors = { email: [m.settings_account_email_taken()] };
					accountBaseline = previous;
					isAccountSaving = false;
					return;
				}
				throw new Error('account-update-failed');
			}

			accountForm = {
				name: data.user?.name ?? payload.name,
				email: data.user?.email ?? payload.email,
				phone: data.user?.phone ?? payload.phone ?? ''
			};
			accountBaseline = { ...accountForm };
			accountErrors = {};
			toastStore.success(m.settings_account_save_success());
		} catch {
			accountBaseline = previous;
			accountForm = { ...previous };
			toastStore.error(m.settings_account_save_error());
		} finally {
			isAccountSaving = false;
		}
	}

	async function handlePasswordSave() {
		if (isPasswordSaving) return;

		passwordErrors = {};
		const payload = {
			currentPassword: passwordForm.current.trim(),
			newPassword: passwordForm.next.trim(),
			confirmPassword: passwordForm.confirm.trim()
		};

		const result = passwordFormSchema.safeParse(payload);
		if (!result.success) {
			applyPasswordErrors(result.error.issues);
			return;
		}

		if (payload.newPassword !== payload.confirmPassword) {
			passwordErrors = { confirm: [m.settings_password_mismatch()] };
			return;
		}

		isPasswordSaving = true;
		try {
			const res = await fetch('/api/users/password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					currentPassword: payload.currentPassword,
					newPassword: payload.newPassword
				})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (data?.error === 'invalid_password') {
					passwordErrors = { current: [m.settings_password_invalid_current()] };
					return;
				}
				if (data?.error === 'no_credential_account') {
					toastStore.error(m.settings_password_no_credentials());
					return;
				}
				throw new Error('password-update-failed');
			}

			passwordForm = { current: '', next: '', confirm: '' };
			passwordErrors = {};
			toastStore.success(m.settings_password_update_success());
		} catch {
			toastStore.error(m.settings_password_update_error());
		} finally {
			isPasswordSaving = false;
		}
	}
</script>

<section aria-labelledby="account-section" class="account-settings-stack">
	{#if user}
		<div class="settings-card">
			<SettingsGroupTitle
				title={m.settings_account_section()}
				desc={m.settings_account_description()}
				id="account-section"
			/>
			<SettingsGrid>
				<SettingsRow ariaDisabled={isAccountSaving}>
					{#snippet label()}
						<div class="title">{m.settings_account_name_label()}</div>
					{/snippet}
					{#snippet control()}
						<InlineEditor
							id="settings-name"
							name="settings-name"
							value={accountForm.name}
							placeholder={m.auth_name_placeholder()}
							ariaLabel={m.settings_account_name_label()}
							autocomplete="name"
							disabled={isAccountSaving}
							onInput={(value) => {
								accountForm.name = value;
								clearAccountError('name');
							}}
						/>
					{/snippet}
					{#snippet children()}
						{#if accountErrors.name}
							<p class="field-error" role="alert">{accountErrors.name[0]}</p>
						{/if}
					{/snippet}
				</SettingsRow>

				<SettingsRow ariaDisabled={isAccountSaving}>
					{#snippet label()}
						<div class="title">{m.settings_account_email_label()}</div>
					{/snippet}
					{#snippet control()}
						<InlineEditor
							id="settings-email"
							name="settings-email"
							value={accountForm.email}
							inputType="email"
							placeholder={m.auth_email_placeholder()}
							ariaLabel={m.settings_account_email_label()}
							autocomplete="email"
							disabled={isAccountSaving}
							onInput={(value) => {
								accountForm.email = value;
								clearAccountError('email');
							}}
						/>
					{/snippet}
					{#snippet children()}
						{#if accountErrors.email}
							<p class="field-error" role="alert">{accountErrors.email[0]}</p>
						{/if}
					{/snippet}
				</SettingsRow>

				<SettingsRow ariaDisabled={isAccountSaving}>
					{#snippet label()}
						<div class="title">{m.settings_account_phone_label()}</div>
					{/snippet}
					{#snippet control()}
						<InlineEditor
							id="settings-phone"
							name="settings-phone"
							value={accountForm.phone}
							inputType="tel"
							inputmode="tel"
							placeholder={m.settings_account_phone_placeholder()}
							ariaLabel={m.settings_account_phone_label()}
							autocomplete="tel"
							disabled={isAccountSaving}
							onInput={(value) => {
								accountForm.phone = value;
								clearAccountError('phone');
							}}
						/>
					{/snippet}
					{#snippet children()}
						{#if accountErrors.phone}
							<p class="field-error" role="alert">{accountErrors.phone[0]}</p>
						{/if}
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

				<SettingsRow class="actions-row">
					{#snippet label()}
						<div class="title">{m.common_actions()}</div>
					{/snippet}
					{#snippet control()}
						<div class="actions">
							<Button
								variant="secondary"
								size="small"
								onclick={resetAccountForm}
								disabled={!hasAccountChanges || isAccountSaving}
							>
								{m.common_cancel()}
							</Button>
							<Button
								size="small"
								onclick={handleAccountSave}
								isLoading={isAccountSaving}
								disabled={!hasAccountChanges || isAccountSaving}
							>
								{m.common_save()}
							</Button>
						</div>
					{/snippet}
				</SettingsRow>
			</SettingsGrid>
		</div>

		<div class="settings-card">
			<SettingsGroupTitle
				title={m.settings_password_section()}
				desc={m.settings_password_description()}
				id="password-section"
			/>
			<SettingsGrid>
				<SettingsRow ariaDisabled={isPasswordSaving}>
					{#snippet label()}
						<div class="title">{m.settings_password_current_label()}</div>
					{/snippet}
					{#snippet control()}
						<InlineEditor
							id="settings-current-password"
							name="settings-current-password"
							value={passwordForm.current}
							inputType={showCurrentPassword ? 'text' : 'password'}
							placeholder={m.settings_password_current_placeholder()}
							ariaLabel={m.settings_password_current_label()}
							autocomplete="current-password"
							disabled={isPasswordSaving}
							onInput={(value) => {
								passwordForm.current = value;
								clearPasswordError('current');
							}}
						>
							{#snippet trailingIcon()}
								<IconButton
									tooltip={showCurrentPassword ? m.auth_hide_password() : m.auth_show_password()}
									aria-label={showCurrentPassword ? m.auth_hide_password() : m.auth_show_password()}
									ariaPressed={showCurrentPassword}
									noBackground
									disabled={isPasswordSaving}
									onclick={() => (showCurrentPassword = !showCurrentPassword)}
								>
									<Icon>
										{#if showCurrentPassword}
											<EyeOff />
										{:else}
											<Eye />
										{/if}
									</Icon>
								</IconButton>
							{/snippet}
						</InlineEditor>
					{/snippet}
					{#snippet children()}
						{#if passwordErrors.current}
							<p class="field-error" role="alert">{passwordErrors.current[0]}</p>
						{/if}
					{/snippet}
				</SettingsRow>

				<SettingsRow ariaDisabled={isPasswordSaving}>
					{#snippet label()}
						<div class="title">{m.settings_password_new_label()}</div>
					{/snippet}
					{#snippet control()}
						<InlineEditor
							id="settings-new-password"
							name="settings-new-password"
							value={passwordForm.next}
							inputType={showNewPassword ? 'text' : 'password'}
							placeholder={m.auth_password_new_placeholder()}
							ariaLabel={m.settings_password_new_label()}
							autocomplete="new-password"
							disabled={isPasswordSaving}
							onInput={(value) => {
								passwordForm.next = value;
								clearPasswordError('next');
								clearPasswordError('confirm');
							}}
						>
							{#snippet trailingIcon()}
								<IconButton
									tooltip={showNewPassword ? m.auth_hide_password() : m.auth_show_password()}
									aria-label={showNewPassword ? m.auth_hide_password() : m.auth_show_password()}
									ariaPressed={showNewPassword}
									noBackground
									disabled={isPasswordSaving}
									onclick={() => (showNewPassword = !showNewPassword)}
								>
									<Icon>
										{#if showNewPassword}
											<EyeOff />
										{:else}
											<Eye />
										{/if}
									</Icon>
								</IconButton>
							{/snippet}
						</InlineEditor>
					{/snippet}
					{#snippet children()}
						{#if passwordErrors.next}
							<p class="field-error" role="alert">{passwordErrors.next[0]}</p>
						{/if}
					{/snippet}
				</SettingsRow>

				<SettingsRow ariaDisabled={isPasswordSaving}>
					{#snippet label()}
						<div class="title">{m.settings_password_confirm_label()}</div>
					{/snippet}
					{#snippet control()}
						<InlineEditor
							id="settings-confirm-password"
							name="settings-confirm-password"
							value={passwordForm.confirm}
							inputType={showConfirmPassword ? 'text' : 'password'}
							placeholder={m.auth_password_confirm_placeholder()}
							ariaLabel={m.settings_password_confirm_label()}
							autocomplete="new-password"
							disabled={isPasswordSaving}
							onInput={(value) => {
								passwordForm.confirm = value;
								clearPasswordError('confirm');
							}}
						>
							{#snippet trailingIcon()}
								<IconButton
									tooltip={showConfirmPassword ? m.auth_hide_password() : m.auth_show_password()}
									aria-label={showConfirmPassword ? m.auth_hide_password() : m.auth_show_password()}
									ariaPressed={showConfirmPassword}
									noBackground
									disabled={isPasswordSaving}
									onclick={() => (showConfirmPassword = !showConfirmPassword)}
								>
									<Icon>
										{#if showConfirmPassword}
											<EyeOff />
										{:else}
											<Eye />
										{/if}
									</Icon>
								</IconButton>
							{/snippet}
						</InlineEditor>
					{/snippet}
					{#snippet children()}
						{#if passwordErrors.confirm}
							<p class="field-error" role="alert">{passwordErrors.confirm[0]}</p>
						{/if}
					{/snippet}
				</SettingsRow>

				<SettingsRow class="actions-row" ariaDisabled={isPasswordSaving}>
					{#snippet label()}
						<div class="title">{m.common_actions()}</div>
					{/snippet}
					{#snippet control()}
						<div class="actions">
							<Button
								size="small"
								onclick={handlePasswordSave}
								isLoading={isPasswordSaving}
								disabled={isPasswordSaving}
							>
								{m.settings_password_update_button()}
							</Button>
						</div>
					{/snippet}
				</SettingsRow>
			</SettingsGrid>
		</div>

		{#if user.role === 'driver'}
			<DriverPreferencesSection />
		{/if}
	{:else}
		<div class="settings-card">
			<p class="not-signed-in">{m.settings_not_signed_in()}</p>
		</div>
	{/if}
</section>

<style>
	.account-settings-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.role-badge {
		padding: var(--spacing-0-5) var(--spacing-2);
		background: var(--interactive-accent-muted);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--interactive-accent);
	}

	.actions {
		display: flex;
		gap: var(--spacing-2);
		align-items: center;
	}

	.field-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}

	.not-signed-in {
		color: var(--text-muted);
		padding: var(--spacing-3);
	}
</style>
