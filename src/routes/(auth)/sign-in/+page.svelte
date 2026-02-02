<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Lock from '$lib/components/icons/Lock.svelte';
	import Mail from '$lib/components/icons/Mail.svelte';
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

<div class="auth-card">
	<header class="auth-header">
		<span class="auth-eyebrow">{m.auth_brand_eyebrow()}</span>
		<h1 class="auth-title">{m.auth_sign_in_title()}</h1>
		<p class="auth-subtitle">{m.auth_sign_in_subtitle()}</p>
	</header>

	{#if errorMessage}
		<div class="auth-error">
			<NoticeBanner variant="warning">
				<span>{errorMessage}</span>
			</NoticeBanner>
		</div>
	{/if}

	<form
		class="auth-form"
		onsubmit={(event) => {
			event.preventDefault();
			handleSubmit();
		}}
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

		<InlineEditor
			id="password"
			name="password"
			inputType="password"
			autocomplete="current-password"
			placeholder={m.auth_password_placeholder()}
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
				<Icon><Lock /></Icon>
			{/snippet}
		</InlineEditor>

		<div class="auth-row">
			<Checkbox bind:checked={rememberMe} label={m.auth_sign_in_remember_me()} />
		</div>

		<Button
			variant="primary"
			size="large"
			type="submit"
			fill={true}
			isLoading={isSubmitting}
			disabled={isSubmitting}
		>
			{m.auth_sign_in_button()}
		</Button>
	</form>

	<div class="auth-footer">
		<span>{m.auth_sign_in_no_account()}</span>
		<a href="/sign-up">{m.auth_sign_in_create_account()}</a>
	</div>
</div>
