<!--
	MenuItem - A single item in a ContextMenu.

	@example Action item with icon
	<MenuItem label="Edit" onclick={handleEdit}>
		{#snippet icon()}<Icon><Pencil /></Icon>{/snippet}
	</MenuItem>

	@example Separator
	<MenuItem isSeparator />
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label = '',
		onclick,
		isSeparator = false,
		disabled = false,
		icon
	} = $props<{
		/** Display label for the menu item */
		label?: string;
		/** Click handler */
		onclick?: () => void;
		/** Render as a separator line instead of a clickable item */
		isSeparator?: boolean;
		/** Whether the item is disabled */
		disabled?: boolean;
		/** Optional icon snippet to display before the label */
		icon?: Snippet;
	}>();

	function handleClick() {
		if (!disabled && onclick) {
			onclick();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

{#if isSeparator}
	<li class="menu-separator" role="separator"></li>
{:else}
	<li
		class="menu-item"
		class:disabled
		role="menuitem"
		tabindex={disabled ? -1 : 0}
		aria-disabled={disabled}
		onclick={handleClick}
		onkeydown={handleKeydown}
	>
		{#if icon}
			<span class="menu-item-icon">
				{@render icon()}
			</span>
		{/if}
		<span class="menu-item-label">{label}</span>
	</li>
{/if}

<style>
	.menu-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		border-radius: var(--radius-base);
		cursor: pointer;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
		transition: background-color 0.1s ease;
	}

	.menu-item:hover,
	.menu-item:focus {
		background: var(--surface-highlight);
		outline: none;
	}

	.menu-item.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.menu-item.disabled:hover,
	.menu-item.disabled:focus {
		background: transparent;
	}

	.menu-item-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.menu-item-label {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.menu-separator {
		height: 1px;
		background: var(--border-primary);
		margin: var(--spacing-1) var(--spacing-2);
	}
</style>
