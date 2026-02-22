<script lang="ts">
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import type { Snippet } from 'svelte';

	const {
		label,
		onClick,
		icon,
		badgeLabel,
		disabled = false,
		selected = false
	} = $props<{
		label: string;
		onClick: () => void;
		icon?: Snippet;
		badgeLabel?: string | null;
		children?: Snippet;
		disabled?: boolean;
		selected?: boolean;
	}>();

	function handleKeydown(e: KeyboardEvent) {
		if (disabled) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onClick();
		}
	}
</script>

<div
	class="nav-item"
	class:disabled
	class:selected
	role="button"
	tabindex={disabled ? -1 : 0}
	aria-label={label}
	aria-disabled={disabled}
	aria-current={selected ? 'page' : undefined}
	onclick={disabled ? undefined : onClick}
	onkeydown={disabled ? undefined : handleKeydown}
>
	<div class="icon-center">
		<IconButton
			tooltip={label}
			{disabled}
			ariaDisabled={disabled}
			display={true}
			isActive={selected}
		>
			{#if icon}
				{@render icon()}
			{/if}
		</IconButton>
		{#if badgeLabel}
			<span class="nav-badge" aria-hidden="true">{badgeLabel}</span>
		{/if}
	</div>
	<div class="nav-text">
		<span class="nav-label">{label}</span>
	</div>
</div>

<style>
	.nav-item {
		position: relative;
		display: flex;
		align-items: center;
		width: var(--sidebar-item-width, auto);
		overflow: hidden;
		border-radius: var(--radius-base);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
		text-decoration: none;
	}

	.icon-center {
		position: relative;
	}

	.nav-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-size: 10px;
		font-weight: var(--font-weight-bold);
		border-radius: var(--radius-full);
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	/* Icons inherit the soft/dark color shift from nav-item */
	.nav-item :global(.icon-button) {
		color: inherit;
	}

	.nav-item:hover {
		background-color: var(--interactive-hover);
		color: var(--text-normal);
	}

	.nav-item.selected {
		background-color: var(--interactive-hover);
		color: var(--text-normal);
	}

	.nav-item.selected:hover {
		background-color: var(--interactive-hover);
	}

	.nav-item.selected :global(.icon) {
		color: var(--text-normal);
	}

	.nav-text {
		position: absolute;
		left: var(--spacing-6);
		top: 50%;
		transform: translateY(-50%);
		transition: opacity 0.15s ease-out;
		opacity: 1;
	}

	.nav-label {
		font-size: var(--font-size-base);
		white-space: nowrap;
	}
</style>
