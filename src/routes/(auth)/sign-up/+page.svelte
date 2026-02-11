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
	import Mail from '$lib/components/icons/Mail.svelte';
	import User from '$lib/components/icons/User.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const redirectTo = $derived($page.url.searchParams.get('redirect') ?? '/');

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);

	const PasswordToggleIcon = $derived(showPassword ? EyeOff : Eye);
	const ConfirmPasswordToggleIcon = $derived(showConfirmPassword ? EyeOff : Eye);

	const handleSubmit = async () => {
		if (isSubmitting) {
			return;
		}

		errorMessage = null;
		if (password !== confirmPassword) {
			errorMessage = m.auth_sign_up_error_password_mismatch();
			return;
		}

		isSubmitting = true;

		const { error } = await authClient.signUp.email(
			{
				name,
				email,
				password,
				callbackURL: redirectTo
			},
			{
				onSuccess: () => {
					goto(redirectTo);
				}
			}
		);

		if (error) {
			errorMessage = error.message ?? m.auth_sign_up_error_unable();
		}

		isSubmitting = false;
	};
</script>

<div class="auth-card">
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
			id="name"
			name="name"
			inputType="text"
			autocomplete="name"
			placeholder={m.auth_name_placeholder()}
			ariaLabel={m.auth_name_label()}
			required={true}
			mode="form"
			variant="bordered"
			size="base"
			value={name}
			onInput={(v) => {
				name = v;
			}}
			onSave={async (v) => {
				name = v;
			}}
		>
			{#snippet leadingIcon()}
				<Icon><User /></Icon>
			{/snippet}
		</InlineEditor>

		<InlineEditor
			id="email"
			name="email"
			inputType="email"
			autocomplete="email"
			placeholder={m.auth_email_placeholder()}
			ariaLabel={m.auth_email_label()}
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
			id="password"
			name="password"
			inputType={showPassword ? 'text' : 'password'}
			autocomplete="new-password"
			placeholder={m.auth_password_create_placeholder()}
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
					onclick={() => (showPassword = !showPassword)}
					tabindex="-1"
				>
					<Icon><PasswordToggleIcon /></Icon>
				</button>
			{/snippet}
		</InlineEditor>

		<InlineEditor
			id="confirm-password"
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
					onclick={() => (showConfirmPassword = !showConfirmPassword)}
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
			{m.auth_sign_up_button()}
		</Button>
	</form>

	<div class="auth-footer">
		<span>{m.auth_sign_up_existing_account()}</span>
		<a href="/sign-in">{m.auth_sign_up_sign_in()}</a>
	</div>
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

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.auth-footer {
		text-align: center;
		font-size: var(--font-size-sm);
		margin-top: var(--spacing-3);
	}

	.auth-footer span {
		color: var(--text-muted);
	}

	.auth-footer a {
		margin-left: 0.5rem;
		color: var(--text-accent);
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
