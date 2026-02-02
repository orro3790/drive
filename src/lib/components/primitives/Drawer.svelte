<!--
  File: src/lib/components/primitives/Drawer.svelte
  A side drawer/sheet component that slides in from the right.
  Uses the same patterns as Modal.svelte but with side positioning.

  Usage:
  <Drawer title="Academy Details" onClose={handleClose}>
    <YourContent />
  </Drawer>

  Or with custom header actions:
  <Drawer title="Academy Details" onClose={handleClose}>
    {#snippet headerActions()}
      <Button>Save</Button>
    {/snippet}
    <YourContent />
  </Drawer>
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { portal } from '$lib/actions/portal';
	import IconButton from './IconButton.svelte';
	import Icon from './Icon.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';

	let {
		title,
		description,
		onClose,
		headerActions,
		children,
		width = 'clamp(320px, 50vw, 600px)',
		closeOnEscape = true,
		closeOnBackdrop = true
	} = $props<{
		/** Drawer title */
		title: string;
		/** Optional description shown below title */
		description?: string;
		/** Callback when drawer should close */
		onClose: () => void;
		/** Optional custom actions for the header (renders before close button) */
		headerActions?: Snippet;
		/** Drawer body content */
		children: Snippet;
		/** Width of drawer (default: clamp(320px, 50vw, 600px)) */
		width?: string;
		/** Close drawer on Escape key (default: true) */
		closeOnEscape?: boolean;
		/** Close drawer on backdrop click (default: true) */
		closeOnBackdrop?: boolean;
	}>();

	let isBackdropPointerDown = false;

	// Escape key handling
	onMount(() => {
		if (!closeOnEscape) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	});

	function handleBackdropPointerDown(e: PointerEvent) {
		isBackdropPointerDown = e.target === e.currentTarget;
	}

	function handleBackdropPointerUp(e: PointerEvent) {
		if (closeOnBackdrop && isBackdropPointerDown && e.target === e.currentTarget) {
			onClose();
		}
		isBackdropPointerDown = false;
	}
</script>

<div
	class="drawer-backdrop"
	use:portal
	role="dialog"
	aria-modal="true"
	aria-labelledby="drawer-title"
	tabindex="-1"
	onpointerdown={handleBackdropPointerDown}
	onpointerup={handleBackdropPointerUp}
	onpointercancel={() => (isBackdropPointerDown = false)}
	onkeydown={(e) => closeOnEscape && e.key === 'Escape' && onClose()}
>
	<div class="drawer-container" style="width: {width}">
		<header class="drawer-header">
			<div class="header-text">
				<h2 id="drawer-title">{title}</h2>
				{#if description}
					<p class="drawer-description">{description}</p>
				{/if}
			</div>
			<div class="header-actions">
				{#if headerActions}
					{@render headerActions()}
				{/if}
				<IconButton onclick={onClose} tooltip={m.common_close()}>
					<Icon><XIcon /></Icon>
				</IconButton>
			</div>
		</header>

		<div class="drawer-body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-drawer);
		background: var(--overlay-backdrop);
		backdrop-filter: blur(4px);
		display: flex;
		justify-content: flex-end;
		animation: fadeIn 150ms ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.drawer-container {
		background: var(--surface-primary);
		height: 100%;
		max-width: 90vw;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow: var(--shadow-lg);
		animation: slideIn 200ms ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateX(100%);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.drawer-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: var(--spacing-3);
		flex-shrink: 0;
		border-bottom: 1px solid var(--border-muted);
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.header-text h2 {
		margin: 0;
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.drawer-description {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		letter-spacing: var(--letter-spacing-sm);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.drawer-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-3);
	}
</style>
