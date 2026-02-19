<script lang="ts">
	import { enhance } from '$app/forms';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Eye from '$lib/components/icons/Eye.svelte';
	import EyeOff from '$lib/components/icons/EyeOff.svelte';
	import Key from '$lib/components/icons/Key.svelte';
	import Mail from '$lib/components/icons/Mail.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { form } = $props();

	let email = $state('');
	let newPassword = $state('');

	// Restore email from form on validation errors
	$effect(() => {
		if (form?.email && !form?.success) {
			email = form.email;
		}
	});
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let isSubmitting = $state(false);

	const PasswordToggleIcon = $derived(showPassword ? EyeOff : Eye);
	const ConfirmPasswordToggleIcon = $derived(showConfirmPassword ? EyeOff : Eye);

	function handlePasswordToggle() {
		showPassword = !showPassword;
	}

	function handleConfirmPasswordToggle() {
		showConfirmPassword = !showConfirmPassword;
	}

	function resetForm() {
		email = '';
		newPassword = '';
		confirmPassword = '';
	}

	function getFormErrorMessage(
		errorKey: string | null | undefined,
		fallback?: string
	): string | null {
		switch (errorKey) {
			case 'admin_reset_password_error_email_required':
				return m.admin_reset_password_error_email_required();
			case 'admin_reset_password_error_password_min_length':
				return m.admin_reset_password_error_password_min_length();
			case 'admin_reset_password_error_password_mismatch':
				return m.admin_reset_password_error_password_mismatch();
			case 'admin_reset_password_error_user_not_found':
				return m.admin_reset_password_error_user_not_found();
			case 'admin_reset_password_error_no_password_account':
				return m.admin_reset_password_error_no_password_account();
			case 'admin_reset_password_error_access_denied':
				return m.admin_reset_password_error_access_denied();
			case 'admin_reset_password_error_failed':
				return m.admin_reset_password_error_failed();
			default:
				return fallback ?? null;
		}
	}
</script>

<div class="admin-reset-container">
	<div class="admin-reset-card">
		<header class="card-header">
			<h2>{m.admin_reset_password_title()}</h2>
			<p class="subtitle">{m.admin_reset_password_subtitle()}</p>
		</header>

		{#if form?.success}
			<NoticeBanner variant="success">
				{m.admin_reset_password_success({ email: form.email })}
			</NoticeBanner>
			<Button variant="secondary" size="standard" fill={true} onclick={resetForm}>
				{m.admin_reset_password_reset_another_user()}
			</Button>
		{:else}
			{@const errorMessage = getFormErrorMessage(form?.errorKey, form?.error)}
			{#if errorMessage}
				<NoticeBanner variant="warning">{errorMessage}</NoticeBanner>
			{/if}

			<form
				class="reset-form"
				method="POST"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
						if (form?.success) {
							newPassword = '';
							confirmPassword = '';
						}
					};
				}}
			>
				<InlineEditor
					id="email"
					name="email"
					inputType="email"
					autocomplete="off"
					placeholder={m.admin_reset_password_user_email_placeholder()}
					ariaLabel={m.admin_reset_password_user_email_label()}
					required={true}
					mode="form"
					variant="bordered"
					size="base"
					value={email}
					onInput={(v) => {
						email = v;
					}}
					onSave={async (v) => {
						email = v;
					}}
				>
					{#snippet leadingIcon()}
						<Icon><Mail /></Icon>
					{/snippet}
				</InlineEditor>

				<InlineEditor
					id="newPassword"
					name="newPassword"
					inputType={showPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={m.auth_password_new_placeholder()}
					ariaLabel={m.auth_password_label()}
					required={true}
					mode="form"
					variant="bordered"
					size="base"
					value={newPassword}
					onInput={(v) => {
						newPassword = v;
					}}
					onSave={async (v) => {
						newPassword = v;
					}}
				>
					{#snippet leadingIcon()}
						<button
							type="button"
							class="icon-toggle"
							aria-label={showPassword ? m.auth_hide_password() : m.auth_show_password()}
							aria-pressed={showPassword}
							onclick={handlePasswordToggle}
							tabindex="-1"
						>
							<Icon><PasswordToggleIcon /></Icon>
						</button>
					{/snippet}
				</InlineEditor>

				<InlineEditor
					id="confirmPassword"
					name="confirmPassword"
					inputType={showConfirmPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={m.auth_password_confirm_placeholder()}
					ariaLabel={m.auth_password_confirm_label()}
					required={true}
					mode="form"
					variant="bordered"
					size="base"
					value={confirmPassword}
					onInput={(v) => {
						confirmPassword = v;
					}}
					onSave={async (v) => {
						confirmPassword = v;
					}}
				>
					{#snippet leadingIcon()}
						<button
							type="button"
							class="icon-toggle"
							aria-label={showConfirmPassword ? m.auth_hide_password() : m.auth_show_password()}
							aria-pressed={showConfirmPassword}
							onclick={handleConfirmPasswordToggle}
							tabindex="-1"
						>
							<Icon><ConfirmPasswordToggleIcon /></Icon>
						</button>
					{/snippet}
				</InlineEditor>

				<Button
					variant="primary"
					size="standard"
					type="submit"
					fill={true}
					isLoading={isSubmitting}
					disabled={isSubmitting}
				>
					<Icon><Key /></Icon>
					{m.admin_reset_password_button()}
				</Button>
			</form>
		{/if}
	</div>
</div>

<style>
	.admin-reset-container {
		display: flex;
		justify-content: center;
		padding: var(--spacing-6);
	}

	.admin-reset-card {
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		padding: var(--spacing-6);
		border-radius: var(--radius-lg);
		background: var(--surface-primary);
		border: var(--border-width-thin) solid var(--border-muted);
		box-shadow: var(--shadow-md);
	}

	.card-header {
		text-align: center;
	}

	h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
		letter-spacing: -0.01em;
		color: var(--text-normal);
	}

	.subtitle {
		margin: var(--spacing-2) 0 0;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.reset-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.icon-toggle {
		appearance: none;
		-webkit-appearance: none;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-muted);
		border-radius: var(--radius-base);
		outline: none;
	}

	.icon-toggle:hover {
		color: var(--text-normal);
	}

	.icon-toggle:focus-visible {
		box-shadow: 0 0 0 2px var(--interactive-accent);
	}
</style>
