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
	import Sun from '$lib/components/icons/Sun.svelte';
	import Moon from '$lib/components/icons/Moon.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import DriverPreferencesSection from './DriverPreferencesSection.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { User } from '$lib/types/user';
	import { userProfileUpdateSchema } from '$lib/schemas/user-settings';
	import { getDomTheme, applyTheme, type Theme } from '$lib/utils/theme';
	import { getLocale, setLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
	import { browser } from '$app/environment';

	let { user }: { user: User | null } = $props();

	// Theme
	let currentTheme = $state<Theme>(getDomTheme() ?? 'dark');

	function setTheme(theme: Theme) {
		currentTheme = theme;
		applyTheme(theme);
	}

	// Language
	const LANGUAGE_LABELS: Record<string, string> = {
		en: 'English',
		zh: '中文',
		'zh-Hant': '粵語'
	};
	const currentLocale = $derived(browser ? getLocale() : 'en');
	const languageOptions = locales.map((locale) => ({
		value: locale,
		label: LANGUAGE_LABELS[locale] ?? locale
	}));

	function handleLanguageChange(newLocale: string | number) {
		if (newLocale === currentLocale) return;
		setLocale(newLocale as Locale);
	}

	type AccountField = 'name' | 'email' | 'phone';
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

	const hasPasswordInput = $derived.by(
		() =>
			passwordForm.current.trim().length > 0 ||
			passwordForm.next.trim().length > 0 ||
			passwordForm.confirm.trim().length > 0
	);
	const hasPasswordErrors = $derived(
		Boolean(passwordErrors.current || passwordErrors.next || passwordErrors.confirm)
	);

	const passwordFormSchema = z.object({
		currentPassword: z.string().min(1),
		newPassword: z.string().min(8),
		confirmPassword: z.string().min(1)
	});

	$effect(() => {
		if (!user) return;
		const formData = {
			name: user.name ?? '',
			email: user.email ?? '',
			phone: user.phone ?? ''
		};
		accountForm = formData;
		accountBaseline = { ...formData };
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

	function mapAccountErrors(issues: ZodIssue[]): AccountErrors {
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
		return nextErrors;
	}

	function normalizeAccountField(field: AccountField, value: string): string {
		if (field === 'email') {
			return value.trim().toLowerCase();
		}

		return value.trim();
	}

	function buildAccountPayload(source: { name: string; email: string; phone: string }) {
		return {
			name: source.name.trim(),
			email: source.email.trim().toLowerCase(),
			phone: source.phone.trim() || null
		};
	}

	function hasAccountFieldChanges(field: AccountField): boolean {
		return (
			normalizeAccountField(field, accountForm[field]) !==
			normalizeAccountField(field, accountBaseline[field])
		);
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

	async function handleAccountFieldSave(field: AccountField) {
		if (!user || isAccountSaving || !hasAccountFieldChanges(field)) return;

		accountErrors = { ...accountErrors, [field]: undefined };
		const draft = {
			...accountBaseline,
			[field]: accountForm[field]
		};
		const payload = buildAccountPayload(draft);

		const result = userProfileUpdateSchema.safeParse(payload);
		if (!result.success) {
			const nextErrors = mapAccountErrors(result.error.issues);
			accountErrors = { ...accountErrors, [field]: nextErrors[field] };
			return;
		}

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
					accountErrors = { ...accountErrors, email: [m.settings_account_email_taken()] };
					return;
				}
				throw new Error('account-update-failed');
			}

			const nextBaseline = {
				name: data.user?.name ?? payload.name,
				email: data.user?.email ?? payload.email,
				phone: data.user?.phone ?? payload.phone ?? ''
			};
			accountBaseline = { ...nextBaseline };
			accountForm = {
				...accountForm,
				[field]: nextBaseline[field]
			};
			accountErrors = { ...accountErrors, [field]: undefined };
			toastStore.success(m.settings_account_save_success());
		} catch {
			toastStore.error(m.settings_account_save_error());
		} finally {
			isAccountSaving = false;
		}
	}

	function resetPasswordForm() {
		passwordForm = { current: '', next: '', confirm: '' };
		passwordErrors = {};
		showCurrentPassword = false;
		showNewPassword = false;
		showConfirmPassword = false;
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

			resetPasswordForm();
			toastStore.success(m.settings_password_update_success());
		} catch {
			toastStore.error(m.settings_password_update_error());
		} finally {
			isPasswordSaving = false;
		}
	}

	function handlePasswordSubmit(event: Event) {
		event.preventDefault();
		void handlePasswordSave();
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
			<div class="settings-form">
				<SettingsGrid>
					<SettingsRow ariaDisabled={isAccountSaving}>
						{#snippet label()}
							<div class="title">{m.settings_account_name_label()}</div>
						{/snippet}
						{#snippet control()}
							<InlineEditor
								id="settings-name"
								name="settings-name"
								size="small"
								value={accountForm.name}
								placeholder={m.auth_name_placeholder()}
								ariaLabel={m.settings_account_name_label()}
								autocomplete="name"
								disabled={isAccountSaving}
								onInput={(value) => {
									accountForm.name = value;
									clearAccountError('name');
								}}
								onSave={() => {
									void handleAccountFieldSave('name');
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
								size="small"
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
								onSave={() => {
									void handleAccountFieldSave('email');
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
								size="small"
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
								onSave={() => {
									void handleAccountFieldSave('phone');
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
							<span class="role-value">{roleLabel}</span>
						{/snippet}
					</SettingsRow>

					<SettingsRow>
						{#snippet label()}
							<div class="title">{m.settings_theme_label()}</div>
							<div class="desc">{m.settings_theme_desc()}</div>
						{/snippet}
						{#snippet control()}
							<IconButton
								tooltip={m.settings_theme_dark()}
								aria-label={m.settings_theme_dark()}
								isActive={currentTheme === 'dark'}
								onclick={() => setTheme('dark')}
							>
								<Icon><Moon /></Icon>
							</IconButton>
							<IconButton
								tooltip={m.settings_theme_light()}
								aria-label={m.settings_theme_light()}
								isActive={currentTheme === 'light'}
								onclick={() => setTheme('light')}
							>
								<Icon><Sun /></Icon>
							</IconButton>
						{/snippet}
					</SettingsRow>

					<SettingsRow>
						{#snippet label()}
							<div class="title">{m.settings_language_label()}</div>
							<div class="desc">{m.settings_language_desc()}</div>
						{/snippet}
						{#snippet control()}
							<Combobox
								fitContent
								id="ui-language"
								name="uiLanguage"
								options={languageOptions}
								value={currentLocale}
								size="sm"
								onChange={handleLanguageChange}
								aria-label={m.settings_language_label()}
							/>
						{/snippet}
					</SettingsRow>
				</SettingsGrid>
			</div>
		</div>

		<div class="settings-card">
			<SettingsGroupTitle
				title={m.settings_password_section()}
				desc={m.settings_password_description()}
				id="password-section"
			/>
			<form class="password-form" onsubmit={handlePasswordSubmit} novalidate>
				<SettingsGrid>
					<SettingsRow ariaDisabled={isPasswordSaving}>
						{#snippet label()}
							<div class="title">{m.settings_password_current_label()}</div>
						{/snippet}
						{#snippet control()}
							<InlineEditor
								id="settings-current-password"
								name="settings-current-password"
								size="small"
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
								{#snippet leadingIcon()}
									<IconButton
										tooltip={showCurrentPassword ? m.auth_hide_password() : m.auth_show_password()}
										aria-label={showCurrentPassword
											? m.auth_hide_password()
											: m.auth_show_password()}
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
								size="small"
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
								{#snippet leadingIcon()}
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
								size="small"
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
								{#snippet leadingIcon()}
									<IconButton
										tooltip={showConfirmPassword ? m.auth_hide_password() : m.auth_show_password()}
										aria-label={showConfirmPassword
											? m.auth_hide_password()
											: m.auth_show_password()}
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
				</SettingsGrid>

				<div class="password-actions">
					<Button
						variant="ghost"
						size="small"
						type="button"
						onclick={resetPasswordForm}
						disabled={(!hasPasswordInput && !hasPasswordErrors) || isPasswordSaving}
					>
						{m.common_cancel()}
					</Button>
					<Button
						size="small"
						type="submit"
						isLoading={isPasswordSaving}
						disabled={isPasswordSaving}
					>
						{m.settings_password_update_button()}
					</Button>
				</div>
			</form>
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

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		width: 100%;
	}

	.password-form {
		display: flex;
		flex-direction: column;
		width: 100%;
	}

	.password-form :global(.setting-row) {
		padding: var(--spacing-2) 0;
	}

	.password-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
		align-items: center;
		padding-top: var(--spacing-3);
	}

	.role-value {
		font-size: var(--font-size-base);
		color: var(--text-muted);
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
