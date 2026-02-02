<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authClient } from '$lib/auth-client';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Key from '$lib/components/icons/Key.svelte';
	import Lock from '$lib/components/icons/Lock.svelte';
	import Mail from '$lib/components/icons/Mail.svelte';
	import User from '$lib/components/icons/User.svelte';
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

<div class="auth-card">
	<header class="auth-header">
		<span class="auth-eyebrow">{m.auth_brand_eyebrow()}</span>
		<h1 class="auth-title">{m.auth_sign_up_title()}</h1>
		<p class="auth-subtitle">{m.auth_sign_up_subtitle()}</p>
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
			inputType="password"
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
				<Icon><Lock /></Icon>
			{/snippet}
		</InlineEditor>

		<InlineEditor
			id="confirm-password"
			name="confirmPassword"
			inputType="password"
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
				<Icon><Lock /></Icon>
			{/snippet}
		</InlineEditor>

		<div>
			<InlineEditor
				id="invite-code"
				name="inviteCode"
				inputType="text"
				autocomplete="one-time-code"
				placeholder={m.auth_invite_code_placeholder()}
				ariaLabel={m.auth_invite_code_label()}
				mode="form"
				variant="bordered"
				size="base"
				value={inviteCode}
				onInput={(v) => {
					inviteCode = v;
				}}
				onSave={async (v) => {
					inviteCode = v;
				}}
			>
				{#snippet leadingIcon()}
					<Icon><Key /></Icon>
				{/snippet}
			</InlineEditor>
			<p class="auth-hint">{m.auth_invite_code_hint()}</p>
		</div>

		<Button
			variant="primary"
			size="large"
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
