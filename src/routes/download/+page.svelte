<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Download from '$lib/components/icons/Download.svelte';
	import ArrowLeft from '$lib/components/icons/ArrowLeft.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{m.download_page_title()} - Drive</title>
</svelte:head>

<div class="download-page">
	<div class="download-content">
		<img src="/images/logo-flat.png" alt="Drive" class="logo" />

		<h1 class="title">{m.download_page_title()}</h1>
		<p class="subtitle">{m.download_page_subtitle()}</p>

		<div class="download-section">
			<Button variant="primary" size="large" href={data.downloadUrl}>
				<Icon size="small"><Download /></Icon>
				{m.download_page_button()}
			</Button>
			<span class="version">{m.download_page_version({ version: data.currentVersion })}</span>
		</div>

		<p class="instructions">{m.download_page_instructions_short()}</p>

		<a href="/sign-in" class="back-link">
			<Icon size="small"><ArrowLeft /></Icon>
			{m.download_page_back()}
		</a>
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

	.download-content {
		max-width: 360px;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--spacing-4);
	}

	.logo {
		width: 80px;
		height: 80px;
		object-fit: contain;
	}

	.title {
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
		margin: 0;
	}

	.subtitle {
		font-size: var(--font-size-base);
		color: var(--text-muted);
		margin: 0;
	}

	.download-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}

	.version {
		font-size: var(--font-size-sm);
		color: var(--text-faint);
	}

	.instructions {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		text-decoration: none;
		margin-top: var(--spacing-2);
	}

	.back-link:hover {
		color: var(--text-normal);
	}
</style>
