<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import Button from '$lib/components/primitives/Button.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const redirectTo = $derived($page.url.searchParams.get('redirect') ?? '/');

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let inviteCode = $state('');
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);

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
		const headers = inviteCode ? { 'x-invite-code': inviteCode } : undefined;

		const { error } = await authClient.signUp.email(
			{
				name,
				email,
				password,
				callbackURL: redirectTo
			},
			{
				headers,
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

<div class="auth-stack">
	<header class="auth-header">
		<span class="auth-eyebrow">{m.auth_brand_eyebrow()}</span>
		<h1 class="auth-title">{m.auth_sign_up_title()}</h1>
		<p class="auth-subtitle">{m.auth_sign_up_subtitle()}</p>
	</header>

	{#if errorMessage}
		<div class="auth-error">{errorMessage}</div>
	{/if}

	<form
		class="auth-form"
		onsubmit={(event) => {
			event.preventDefault();
			handleSubmit();
		}}
	>
		<label class="auth-field">
			<span class="auth-label">{m.auth_name_label()}</span>
			<input
				class="auth-input"
				type="text"
				autocomplete="name"
				placeholder={m.auth_name_placeholder()}
				required
				bind:value={name}
			/>
		</label>

		<label class="auth-field">
			<span class="auth-label">{m.auth_email_label()}</span>
			<input
				class="auth-input"
				type="email"
				autocomplete="email"
				placeholder={m.auth_email_placeholder()}
				required
				bind:value={email}
			/>
		</label>

		<label class="auth-field">
			<span class="auth-label">{m.auth_password_label()}</span>
			<input
				class="auth-input"
				type="password"
				autocomplete="new-password"
				placeholder={m.auth_password_create_placeholder()}
				required
				bind:value={password}
			/>
		</label>

		<label class="auth-field">
			<span class="auth-label">{m.auth_password_confirm_label()}</span>
			<input
				class="auth-input"
				type="password"
				autocomplete="new-password"
				placeholder={m.auth_password_confirm_placeholder()}
				required
				bind:value={confirmPassword}
			/>
		</label>

		<label class="auth-field">
			<span class="auth-label">{m.auth_invite_code_label()}</span>
			<input
				class="auth-input"
				type="text"
				autocomplete="one-time-code"
				placeholder={m.auth_invite_code_placeholder()}
				bind:value={inviteCode}
			/>
			<p class="auth-hint">{m.auth_invite_code_hint()}</p>
		</label>

		<Button class="auth-button" type="submit" disabled={isSubmitting}>
			{isSubmitting ? m.auth_sign_up_button_loading() : m.auth_sign_up_button()}
		</Button>
	</form>

	<p class="auth-meta">
		{m.auth_sign_up_existing_account()}
		<a class="auth-link" href="/sign-in">{m.auth_sign_up_sign_in()}</a>
	</p>
</div>
