<!--
  File: src/lib/components/primitives/Modal.svelte
  A reusable modal component with consistent backdrop, container, header, and body styling.
  
  Usage:
  <Modal title="Edit Role" description="Optional description" onClose={handleClose}>
    <YourContent />
  </Modal>
  
  Or with custom header actions:
  <Modal title="Edit Role" onClose={handleClose}>
    {#snippet headerActions()}
      <Button>Save</Button>
    {/snippet}
    <YourContent />
  </Modal>
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { portal } from '$lib/actions/portal';
	import { setupDialogFocusTrap } from './dialogFocus';
	import IconButton from './IconButton.svelte';
	import Icon from './Icon.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';

	let {
		title,
		description,
		onClose,
		headerActions,
		children,
		maxWidth = 'clamp(300px, 90vw, 680px)',
		closeOnEscape = true,
		closeOnBackdrop = true
	} = $props<{
		/** Modal title */
		title: string;
		/** Optional description shown below title */
		description?: string;
		/** Callback when modal should close */
		onClose: () => void;
		/** Optional custom actions for the header (renders before close button) */
		headerActions?: Snippet;
		/** Modal body content */
		children: Snippet;
		/** Max width of modal container (default: clamp(300px, 90vw, 680px) for responsive sizing) */
		maxWidth?: string;
		/** Close modal on Escape key (default: true) */
		closeOnEscape?: boolean;
		/** Close modal on backdrop click (default: true) */
		closeOnBackdrop?: boolean;
	}>();

	let isBackdropPointerDown = false;
	let dialogElement: HTMLDivElement | null = null;

	onMount(() => {
		if (!dialogElement) {
			return;
		}

		return setupDialogFocusTrap(dialogElement, onClose, { closeOnEscape });
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

	function handleBackdropClick(e: MouseEvent) {
		// Consume the click so it never reaches elements behind the backdrop.
		// On mobile touch, pointerup may remove the backdrop before the
		// synthesized click fires — this handler prevents click-through.
		if (e.target === e.currentTarget) {
			e.stopPropagation();
		}
	}
</script>

<div
	class="modal-backdrop"
	use:portal
	role="presentation"
	onpointerdown={handleBackdropPointerDown}
	onpointerup={handleBackdropPointerUp}
	onpointercancel={() => (isBackdropPointerDown = false)}
	onclick={handleBackdropClick}
>
	<div
		class="modal-container"
		style="max-width: {maxWidth}"
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		aria-describedby={description ? 'modal-description' : undefined}
		tabindex="-1"
		bind:this={dialogElement}
	>
		<header class="modal-header">
			<div class="header-text">
				<h2 id="modal-title">{title}</h2>
				{#if description}
					<p id="modal-description" class="modal-description">{description}</p>
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

		<div class="modal-body">
			{@render children()}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal);
		background: var(--overlay-backdrop);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--spacing-3);
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

	.modal-container {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		width: 100%;
		max-height: 85vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		animation: slideUp 200ms ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: var(--spacing-3);
		flex-shrink: 0;
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

	.modal-description {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		letter-spacing: var(--letter-spacing-sm);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		/* Nudge down to align icon center with h2 cap height */
		margin-top: 2px;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 0 var(--spacing-4) var(--spacing-4) var(--spacing-4);
	}
</style>
