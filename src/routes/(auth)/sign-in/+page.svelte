<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import * as m from '$lib/paraglide/messages.js';
	import Button from '$lib/components/primitives/Button.svelte';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let isLoading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (isLoading) return;

		error = '';
		isLoading = true;

		try {
			const result = await authClient.signIn.email({
				email,
				password
			});

			if (result.error) {
				error = m.auth_error_invalid_credentials();
			} else {
				// Redirect will be handled by hooks.server.ts based on role
				await goto('/');
			}
		} catch {
			error = m.auth_error_generic();
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="auth-card">
	<h1>{m.auth_sign_in()}</h1>

	<form onsubmit={handleSubmit}>
		<div class="field">
			<label for="email">{m.auth_email()}</label>
			<input
				type="email"
				id="email"
				bind:value={email}
				placeholder={m.auth_email_placeholder()}
				required
				disabled={isLoading}
			/>
		</div>

		<div class="field">
			<label for="password">{m.auth_password()}</label>
			<input
				type="password"
				id="password"
				bind:value={password}
				placeholder={m.auth_password_placeholder()}
				required
				disabled={isLoading}
			/>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<Button type="submit" variant="primary" disabled={isLoading} fill>
			{isLoading ? m.auth_signing_in() : m.auth_sign_in()}
		</Button>
	</form>

	<p class="link-text">
		{m.auth_no_account()}
		<a href="/sign-up">{m.auth_sign_up()}</a>
	</p>
</div>

<style>
	.auth-card {
		width: 100%;
		max-width: 400px;
		padding: var(--spacing-6);
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
	}

	h1 {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
		margin-bottom: var(--spacing-6);
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	input {
		padding: var(--spacing-2) var(--spacing-3);
		font-size: var(--font-size-base);
		color: var(--text-normal);
		background: var(--surface-secondary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-base);
		transition: border-color 0.15s ease;
	}

	input:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: var(--status-error);
		font-size: var(--font-size-sm);
		margin: 0;
	}

	.link-text {
		margin-top: var(--spacing-4);
		text-align: center;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.link-text a {
		color: var(--interactive-accent);
		text-decoration: none;
	}

	.link-text a:hover {
		text-decoration: underline;
	}
</style>
