<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Eye from '$lib/components/icons/Eye.svelte';
	import EyeOff from '$lib/components/icons/EyeOff.svelte';
	import Key from '$lib/components/icons/Key.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const token = $derived($page.url.searchParams.get('token'));
	const errorParam = $derived($page.url.searchParams.get('error'));

	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);
	let isSuccess = $state(false);

	const PasswordToggleIcon = $derived(showPassword ? EyeOff : Eye);
	const ConfirmPasswordToggleIcon = $derived(showConfirmPassword ? EyeOff : Eye);

	function handlePasswordToggle() {
		showPassword = !showPassword;
	}

	function handleConfirmPasswordToggle() {
		showConfirmPassword = !showConfirmPassword;
	}

	const handleSubmit = async () => {
		if (isSubmitting || !token) {
			return;
		}

		errorMessage = null;

		if (password !== confirmPassword) {
			errorMessage = m.auth_sign_up_error_password_mismatch();
			return;
		}

		if (password.length < 8) {
			errorMessage = m.auth_reset_password_min_length();
			return;
		}

		isSubmitting = true;

		const { error } = await authClient.resetPassword({
			newPassword: password,
			token
		});

		if (error) {
			errorMessage = error.message ?? m.auth_reset_password_error();
		} else {
			isSuccess = true;
			setTimeout(() => {
				goto('/sign-in');
			}, 3000);
		}

		isSubmitting = false;
	};

	const hasInvalidToken = $derived(!token || errorParam === 'INVALID_TOKEN');
</script>

<div class="auth-card">
	<header class="auth-header">
		<h2>{m.auth_reset_password_title()}</h2>
		<p class="subtitle">{m.auth_reset_password_subtitle()}</p>
	</header>

	{#if isSuccess}
		<NoticeBanner variant="success">{m.auth_reset_password_success()}</NoticeBanner>
		<p class="redirect-notice">{m.auth_reset_password_redirecting()}</p>
	{:else if hasInvalidToken}
		<NoticeBanner variant="warning">{m.auth_reset_password_invalid_token()}</NoticeBanner>
		<a href="/forgot-password" class="back-link">
			{m.auth_reset_password_request_new()}
		</a>
	{:else}
		{#if errorMessage}
			<NoticeBanner variant="warning">{errorMessage}</NoticeBanner>
		{/if}

		<form
			class="auth-form"
			onsubmit={(event) => {
				event.preventDefault();
				handleSubmit();
			}}
			novalidate
		>
			<InlineEditor
				id="password"
				name="password"
				inputType={showPassword ? 'text' : 'password'}
				autocomplete="new-password"
				placeholder={m.auth_password_new_placeholder()}
				ariaLabel={m.auth_password_label()}
				required={true}
				mode="form"
				variant="bordered"
				size="base"
				value={password}
				onInput={(v) => {
					password = v;
				}}
				onSave={async (v) => {
					password = v;
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
				id="confirm-password"
				name="confirm-password"
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
				{m.auth_reset_password_button()}
			</Button>
		</form>
	{/if}
</div>

<style>
	.auth-card {
		width: 100%;
		max-width: 420px;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		padding: clamp(24px, 4vw, 32px);
		border-radius: var(--radius-lg);
		background: var(--surface-primary);
		border: var(--border-width-thin) solid var(--border-muted);
		box-shadow: var(--shadow-lg);
		color: var(--text-normal);
	}

	.auth-header {
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

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.redirect-notice {
		text-align: center;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-2);
		font-size: var(--font-size-base);
		color: var(--text-accent);
		text-decoration: none;
		transition:
			color var(--transition-duration-200) var(--transition-ease),
			text-decoration var(--transition-duration-200) var(--transition-ease);
	}

	.back-link:hover {
		color: var(--interactive-accent-hover);
		text-decoration: underline;
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
