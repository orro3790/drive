<!--
	ContextMenu - A positioned dropdown menu with keyboard navigation.

	Use with MenuItem, MenuItemControl, and MenuItemInfo for consistent
	menu patterns throughout the app.

	@example Simple action menu
	<ContextMenu x={menuX} y={menuY} closeMenu={close}>
		<MenuItem label="Edit" onclick={handleEdit}>
			{#snippet icon()}<Icon><Pencil /></Icon>{/snippet}
		</MenuItem>
		<MenuItem label="Delete" onclick={handleDelete}>
			{#snippet icon()}<Icon><NoteOff /></Icon>{/snippet}
		</MenuItem>
	</ContextMenu>

	@example Menu with toggle controls
	<ContextMenu x={menuX} y={menuY} closeMenu={close}>
		<MenuItemControl label="Enable feature">
			{#snippet control()}<Toggle checked={enabled} onchange={toggle} />{/snippet}
		</MenuItemControl>
	</ContextMenu>

	@example Confirmation dialog style
	<ContextMenu x={menuX} y={menuY} closeMenu={close}>
		<MenuItemInfo
			title="Delete item?"
			description="This action cannot be undone."
		/>
		<MenuItem isSeparator />
		<MenuItem label="Confirm" onclick={confirm} />
		<MenuItem label="Cancel" onclick={close} />
	</ContextMenu>
-->
<script lang="ts">
	import { portal } from '$lib/actions/portal';
	import { tick } from 'svelte';
	import type { Snippet } from 'svelte';

	let { x, y, closeMenu, children } = $props<{
		/** X coordinate for menu placement */
		x: number;
		/** Y coordinate for menu placement */
		y: number;
		/** Callback to close the menu */
		closeMenu: () => void;
		/** Menu content (use MenuItem, MenuItemControl, MenuItemInfo) */
		children: Snippet;
	}>();

	let menuElement = $state<HTMLElement | null>(null);
	let adjustedX = $state(0);
	let adjustedY = $state(0);

	// Positioning: adjust coordinates to prevent viewport overflow
	$effect(() => {
		const margin = 8;
		adjustedX = x;
		adjustedY = y;

		tick().then(() => {
			if (!menuElement) return;

			const rect = menuElement.getBoundingClientRect();
			let nextX = x;
			let nextY = y;

			// Flip horizontally if overflowing right edge
			if (x + rect.width + margin > window.innerWidth) {
				nextX = Math.max(margin, x - rect.width);
			}

			// Flip vertically if overflowing bottom edge
			if (y + rect.height + margin > window.innerHeight) {
				nextY = Math.max(margin, y - rect.height);
			}

			adjustedX = nextX;
			adjustedY = nextY;
		});
	});

	// Keyboard navigation and click-outside handling
	$effect(() => {
		if (!menuElement) return;

		// Focus first enabled menu item for accessibility
		tick().then(() => {
			if (!menuElement) return;
			const firstItem = menuElement.querySelector(
				'[role="menuitem"]:not(.disabled)'
			) as HTMLElement | null;
			firstItem?.focus();
		});

		// Arrow key navigation within the menu
		function moveFocus(delta: number) {
			if (!menuElement) return;
			const items = Array.from(menuElement.querySelectorAll('[role="menuitem"]')) as HTMLElement[];
			if (items.length === 0) return;

			const currentIndex = items.findIndex((el) => el === document.activeElement);
			let nextIndex: number;

			if (currentIndex === -1) {
				nextIndex = delta > 0 ? 0 : items.length - 1;
			} else {
				nextIndex = (currentIndex + delta + items.length) % items.length;
			}

			items[nextIndex]?.focus();
		}

		function handleKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				closeMenu();
			}
		}

		function handleArrowKeys(e: KeyboardEvent) {
			if (!menuElement) return;
			const isInside = menuElement.contains(document.activeElement);
			if (!isInside) return;

			switch (e.key) {
				case 'ArrowDown':
					e.preventDefault();
					e.stopPropagation();
					moveFocus(1);
					break;
				case 'ArrowUp':
					e.preventDefault();
					e.stopPropagation();
					moveFocus(-1);
					break;
				case 'Home':
					e.preventDefault();
					e.stopPropagation();
					moveFocus(-9999);
					break;
				case 'End':
					e.preventDefault();
					e.stopPropagation();
					moveFocus(9999);
					break;
			}
		}

		function handleClickOutside(event: MouseEvent) {
			const path = (event.composedPath && event.composedPath()) || [];
			const clickedInside = path.some((node) => node === menuElement);
			const clickedOnDatePicker = path.some(
				(node) => node instanceof Element && node.hasAttribute('data-datepicker-calendar')
			);

			if (!clickedInside && !clickedOnDatePicker) {
				closeMenu();
			}
		}

		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('keydown', handleArrowKeys, true);
		window.addEventListener('click', handleClickOutside, {
			capture: true
		});

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('keydown', handleArrowKeys, true);
			window.removeEventListener('click', handleClickOutside, {
				capture: true
			});
		};
	});
</script>

<div
	use:portal
	bind:this={menuElement}
	class="context-menu"
	style="left: {adjustedX}px; top: {adjustedY}px;"
	role="menu"
	aria-orientation="vertical"
>
	<ul class="menu-list">
		{@render children()}
	</ul>
</div>

<style>
	.context-menu {
		position: fixed;
		z-index: var(--z-popover);
		min-width: 220px;
		background: var(--surface-inset);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: var(--spacing-1);
		user-select: none;
	}

	.menu-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
</style>
