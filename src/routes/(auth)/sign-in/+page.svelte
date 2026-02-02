<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import Button from '$lib/components/primitives/Button.svelte';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const redirectTo = $derived($page.url.searchParams.get('redirect') ?? '/');

	let email = $state('');
	let password = $state('');
	let rememberMe = $state(true);
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);

	const handleSubmit = async () => {
		if (isSubmitting) {
			return;
		}

		errorMessage = null;
		isSubmitting = true;

		const { error } = await authClient.signIn.email(
			{
				email,
				password,
				rememberMe,
				callbackURL: redirectTo
			},
			{
				onSuccess: () => {
					goto(redirectTo);
				}
			}
		);

		if (error) {
			errorMessage = error.message ?? m.auth_sign_in_error_unable();
		}

		isSubmitting = false;
	};
</script>

<div class="auth-stack">
	<header class="auth-header">
		<span class="auth-eyebrow">{m.auth_brand_eyebrow()}</span>
		<h1 class="auth-title">{m.auth_sign_in_title()}</h1>
		<p class="auth-subtitle">{m.auth_sign_in_subtitle()}</p>
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
				autocomplete="current-password"
				placeholder={m.auth_password_placeholder()}
				required
				bind:value={password}
			/>
		</label>

		<div class="auth-row">
			<div class="auth-checkbox">
				<Checkbox bind:checked={rememberMe} label={m.auth_sign_in_remember_me()} />
			</div>
		</div>

		<Button class="auth-button" type="submit" disabled={isSubmitting}>
			{isSubmitting ? m.auth_sign_in_button_loading() : m.auth_sign_in_button()}
		</Button>
	</form>

	<p class="auth-meta">
		{m.auth_sign_in_no_account()}
		<a class="auth-link" href="/sign-up">{m.auth_sign_in_create_account()}</a>
	</p>
</div>
