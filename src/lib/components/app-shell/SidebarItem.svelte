<script lang="ts">
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import type { Snippet } from 'svelte';

	const {
		label,
		onClick,
		icon,
		disabled = false,
		selected = false
	} = $props<{
		label: string;
		onClick: () => void;
		icon?: Snippet;
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
		color: var(--text-normal);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			width 0.15s ease-out;
		text-decoration: none;
	}

	/* Override IconButton's default text-muted color to inherit from nav-item */
	.nav-item :global(.icon-button) {
		color: inherit;
	}

	.nav-item:hover {
		background-color: var(--interactive-hover);
		color: var(--text-normal);
	}

	.nav-item.selected {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.nav-item.selected:hover {
		background-color: var(--interactive-accent-hover);
	}

	/* Ensure icon inherits color or is specifically styled if needed */
	.nav-item.selected :global(.icon) {
		color: var(--text-on-accent);
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
