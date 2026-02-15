<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Download from '$lib/components/icons/Download.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showInstructions = $state(false);
</script>

<svelte:head>
	<title>{m.download_page_title()} - Drive</title>
</svelte:head>

<div class="download-page">
	<div class="download-card">
		<div class="card-header">
			<h1 class="title">{m.download_page_title()}</h1>
			<p class="subtitle">{m.download_page_subtitle()}</p>
		</div>

		<div class="platform-section">
			<div class="platform-badge">
				<span class="platform-name">Android</span>
				<span class="version">{m.download_page_version({ version: data.currentVersion })}</span>
			</div>

			<Button variant="primary" size="large" href={data.downloadUrl}>
				<Icon size="small"><Download /></Icon>
				{m.download_page_button()}
			</Button>
		</div>

		<div class="instructions-section">
			<button class="instructions-toggle" onclick={() => (showInstructions = !showInstructions)}>
				<span>{m.download_page_instructions_title()}</span>
				<span class="toggle-icon" class:open={showInstructions}>▼</span>
			</button>

			{#if showInstructions}
				<ol class="instructions-list">
					<li>{m.download_page_instructions_1()}</li>
					<li>{m.download_page_instructions_2()}</li>
					<li>{m.download_page_instructions_3()}</li>
					<li>{m.download_page_instructions_4()}</li>
				</ol>
			{/if}
		</div>

		<div class="sign-in-link">
			<span>{m.download_page_have_account()}</span>
			<a href="/sign-in">{m.download_page_sign_in()}</a>
		</div>
	</div>
</div>

<style>
	.download-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-4);
		background: var(--surface-secondary);
	}

	.download-card {
		max-width: 420px;
		width: 100%;
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-primary);
		padding: var(--spacing-6);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-5);
	}

	.card-header {
		text-align: center;
	}

	.title {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
		margin: 0 0 var(--spacing-2);
	}

	.subtitle {
		font-size: var(--font-size-base);
		color: var(--text-muted);
		margin: 0;
	}

	.platform-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-3);
		padding: var(--spacing-4);
		background: var(--surface-inset);
		border-radius: var(--radius-base);
	}

	.platform-badge {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.platform-name {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.version {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		background: var(--surface-secondary);
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-sm);
	}

	.instructions-section {
		border-top: 1px solid var(--border-secondary);
		padding-top: var(--spacing-4);
	}

	.instructions-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: none;
		border: none;
		padding: var(--spacing-2) 0;
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.instructions-toggle:hover {
		color: var(--text-normal);
	}

	.toggle-icon {
		transition: transform 0.2s ease;
		font-size: var(--font-size-xs);
	}

	.toggle-icon.open {
		transform: rotate(180deg);
	}

	.instructions-list {
		margin: var(--spacing-3) 0 0;
		padding-left: var(--spacing-5);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.instructions-list li {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.5;
	}

	.sign-in-link {
		text-align: center;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.sign-in-link a {
		color: var(--interactive-accent);
		text-decoration: none;
		font-weight: var(--font-weight-medium);
	}

	.sign-in-link a:hover {
		text-decoration: underline;
	}
</style>
