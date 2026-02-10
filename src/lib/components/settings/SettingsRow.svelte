<!--
@component
SettingsRow - A single row in a settings section with label and control areas.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type SettingsRowProps = {
		ariaDisabled?: boolean;
		label?: Snippet;
		control?: Snippet;
		children?: Snippet;
		id?: string;
		class?: string;
		style?: string;
		role?: string;
		'aria-label'?: string;
	} & Pick<HTMLAttributes<HTMLDivElement>, 'id' | 'class' | 'style' | 'role' | 'aria-label'>;

	let {
		ariaDisabled = false,
		label,
		control,
		children,
		id,
		class: className,
		style,
		role,
		'aria-label': ariaLabel
	}: SettingsRowProps = $props();
</script>

<div
	class="setting-row {className || ''}"
	aria-disabled={ariaDisabled}
	{id}
	{style}
	{role}
	aria-label={ariaLabel}
>
	<div class="label">
		{@render label?.()}
	</div>
	<div class="control">
		{@render control?.()}
	</div>
	{#if children}
		<div class="row-children">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.setting-row {
		container-type: inline-size;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: var(--spacing-3);
		padding: var(--spacing-3) 0;
	}

	.row-children {
		flex-basis: 100%;
		width: 100%;
		margin-top: var(--spacing-1);
	}

	/* Keep label visuals consistent; only visually dim control area when disabled. */
	.setting-row[aria-disabled='true'] .control {
		opacity: 0.6;
	}

	.label {
		/* Flex grow, shrink, with 250px minimum before control wraps */
		flex: 1 1 250px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	/* Title and description styling */
	.label :global(.title) {
		color: var(--text-normal);
		font-size: var(--font-size-base);
	}

	.label :global(.desc) {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		letter-spacing: var(--letter-spacing-sm);
		margin-top: var(--spacing-0-5);
	}

	.control {
		flex: 0 0 320px;
		width: 320px;
		display: flex;
		gap: var(--spacing-2);
		justify-content: flex-end;
		align-items: center;
	}

	/* When the row is narrow enough that control wraps, left-align it. */
	@container (max-width: 620px) {
		.control {
			flex-basis: 100%;
			width: 100%;
			justify-content: flex-start;
			margin-top: var(--spacing-2);
		}
	}
</style>
