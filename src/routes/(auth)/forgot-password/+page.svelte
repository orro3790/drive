<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Mail from '$lib/components/icons/Mail.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let email = $state('');
	let errorMessage = $state<string | null>(null);
	let isSubmitting = $state(false);
	let isSuccess = $state(false);

	const handleSubmit = async () => {
		if (isSubmitting) {
			return;
		}

		errorMessage = null;
		isSubmitting = true;

		const { error } = await authClient.requestPasswordReset({
			email,
			redirectTo: window.location.origin + '/reset-password'
		});

		if (error) {
			errorMessage = error.message ?? m.auth_forgot_password_error();
		} else {
			isSuccess = true;
		}

		isSubmitting = false;
	};
</script>

<div class="auth-card">
	<header class="auth-header">
		<h2>{m.auth_forgot_password_title()}</h2>
		<p class="subtitle">{m.auth_forgot_password_subtitle()}</p>
	</header>

	{#if isSuccess}
		<NoticeBanner variant="success">{m.auth_forgot_password_success()}</NoticeBanner>
		<a href="/sign-in" class="back-link">
			<Icon><ArrowLeft /></Icon>
			{m.auth_back_to_sign_in()}
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

			<Button
				variant="primary"
				size="standard"
				type="submit"
				fill={true}
				isLoading={isSubmitting}
				disabled={isSubmitting}
			>
				<Icon><Mail /></Icon>
				{m.auth_forgot_password_button()}
			</Button>
		</form>

		<a href="/sign-in" class="back-link">
			<Icon><ArrowLeft /></Icon>
			{m.auth_back_to_sign_in()}
		</a>
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

	@media (max-width: 600px) {
		.auth-card {
			padding: 0;
			background: transparent;
			border: none;
			box-shadow: none;
			border-radius: 0;
		}
	}
</style>
