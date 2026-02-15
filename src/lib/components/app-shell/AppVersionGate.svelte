<!--
  File: src/lib/components/app-shell/AppVersionGate.svelte

  Blocks native app usage when version is outdated.
  Shows update prompt with download link.
  Browser users pass through immediately.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { checkVersion, type VersionCheckState } from '$lib/utils/appVersion';
	import Button from '$lib/components/primitives/Button.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import * as m from '$lib/paraglide/messages';

	let { children }: { children: Snippet } = $props();

	let state = $state<VersionCheckState>({ status: 'checking' });

	async function doCheck() {
		state = { status: 'checking' };
		state = await checkVersion();
	}

	onMount(() => {
		doCheck();
	});
</script>

{#if state.status === 'checking'}
	<div class="version-gate-loading">
		<div class="spinner"></div>
	</div>
{:else if state.status === 'outdated'}
	<div class="version-gate-blocked">
		<div class="blocked-content">
			<h1 class="blocked-title">{m.app_update_required_title()}</h1>
			<NoticeBanner variant="warning">
				<p>{m.app_update_required_message()}</p>
			</NoticeBanner>
			<div class="version-info">
				<p class="version-line">
					{m.app_update_your_version({ version: String(state.appVersion) })}
				</p>
				<p class="version-line">
					{m.app_update_minimum_version({ version: String(state.serverInfo.minVersion) })}
				</p>
			</div>
			<Button variant="primary" size="large" href={state.serverInfo.downloadUrl}>
				{m.app_update_download_button()}
			</Button>
		</div>
	</div>
{:else if state.status === 'error'}
	<div class="version-gate-blocked">
		<div class="blocked-content">
			<h1 class="blocked-title">{m.app_connection_required_title()}</h1>
			<NoticeBanner variant="warning">
				<p>{m.app_connection_required_message()}</p>
			</NoticeBanner>
			<p class="error-detail">{state.message}</p>
			<Button variant="primary" size="large" onclick={doCheck}>
				{m.app_connection_retry_button()}
			</Button>
		</div>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.version-gate-loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-primary);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border-primary);
		border-top-color: var(--interactive-accent);
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.version-gate-blocked {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-4);
		background: var(--surface-primary);
	}

	.blocked-content {
		max-width: 400px;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		text-align: center;
	}

	.blocked-title {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
		margin: 0;
	}

	.version-info {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.version-line {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		margin: 0;
	}

	.error-detail {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		margin: 0;
	}
</style>
