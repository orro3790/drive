<!--
@component DataTableEmpty
Empty, loading, and error states for the DataTable.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import Spinner from '$lib/components/primitives/Spinner.svelte';

	type Variant = 'loading' | 'error' | 'empty';

	type Props = {
		variant?: Variant;
		title?: string;
		message?: string;
	};

	let { variant = 'empty', title, message }: Props = $props();

	const defaultTitles: Record<Variant, string> = {
		loading: m.table_loading(),
		error: m.table_error(),
		empty: m.table_no_data()
	};

	const defaultMessages: Record<Variant, string> = {
		loading: m.table_loading_message(),
		error: m.table_error_message(),
		empty: m.table_no_data_message()
	};

	// If it's an empty state, only show both if both are explicitly provided.
	// Otherwise, if only one is provided, only show that one.
	// If none are provided, show both defaults.
	const displayTitle = $derived.by(() => {
		if (title) return title;
		if (variant === 'error') return defaultTitles[variant];
		if (variant === 'loading') return undefined; // Only show message for loading
		if (variant === 'empty' && !message) return defaultTitles[variant];
		return undefined;
	});

	const displayMessage = $derived.by(() => {
		if (message) return message;
		if (variant !== 'empty') return defaultMessages[variant];
		if (!title) return defaultMessages[variant];
		return undefined;
	});
</script>

<div class="empty-state" class:error={variant === 'error'}>
	{#if variant === 'loading'}
		<Spinner size={24} />
	{/if}
	{#if displayTitle}
		<p class="empty-title">{displayTitle}</p>
	{/if}
	{#if displayMessage}
		<p class="empty-message">{displayMessage}</p>
	{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-2);
		padding: var(--spacing-5);
		color: var(--text-normal);
		min-height: 200px;
	}

	.empty-state.error {
		color: var(--status-error);
	}

	.empty-title {
		font-weight: var(--font-weight-medium);
		font-size: var(--font-size-base);
		margin: 0;
	}

	.empty-message {
		margin: 0;
	}
</style>
