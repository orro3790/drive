<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { portal } from '$lib/actions/portal';
	import Button from '$lib/components/primitives/Button.svelte';
	import type { Snippet } from 'svelte';

	const VIEWPORT_PADDING = 16;

	let {
		x,
		y,
		title,
		description = undefined,
		confirmLabel,
		cancelLabel,
		confirmVariant = 'primary',
		onConfirm,
		onCancel,
		children = undefined
	}: {
		x: number;
		y: number;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmVariant?: 'primary' | 'secondary' | 'danger';
		onConfirm: () => void;
		onCancel: () => void;
		children?: Snippet;
	} = $props();

	const displayConfirmLabel = $derived(confirmLabel ?? m.common_confirm());
	const displayCancelLabel = $derived(cancelLabel ?? m.common_cancel());

	let dialogEl = $state<HTMLElement | null>(null);
	let adjustedPosition = $state({
		left: 0,
		top: 0,
		flipX: false,
		flipY: false
	});

	// Compute viewport-aware position after dialog renders
	$effect(() => {
		if (!dialogEl) {
			// Set initial position before element is bound
			adjustedPosition = {
				left: x,
				top: y,
				flipX: false,
				flipY: false
			};
			return;
		}

		const rect = dialogEl.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let left = x;
		let top = y;
		let flipX = false;
		let flipY = false;

		// Horizontal: dialog is centered on x, so check both sides
		const halfWidth = rect.width / 2;
		if (x - halfWidth < VIEWPORT_PADDING) {
			// Too close to left edge - align left edge to padding
			left = VIEWPORT_PADDING + halfWidth;
		} else if (x + halfWidth > viewportWidth - VIEWPORT_PADDING) {
			// Too close to right edge - align right edge to padding
			left = viewportWidth - VIEWPORT_PADDING - halfWidth;
		}

		// Vertical: if dialog would overflow bottom, flip to appear above click point
		if (y + rect.height > viewportHeight - VIEWPORT_PADDING) {
			flipY = true;
			top = y;
		}

		adjustedPosition = {
			left,
			top,
			flipX,
			flipY
		};
	});

	$effect(() => {
		if (!dialogEl) return;

		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				onCancel();
			}
		}

		window.addEventListener('keydown', handleKeydown);

		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div use:portal class="confirmation-portal">
	<div class="backdrop" onclick={onCancel} role="presentation" aria-hidden="true"></div>
	<div
		bind:this={dialogEl}
		class="confirmation-dialog"
		class:flip-y={adjustedPosition.flipY}
		style={`left: ${adjustedPosition.left}px; top: ${adjustedPosition.top}px;`}
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<div class="content">
			<p class="title">{title}</p>
			{#if description}
				<p class="description">{description}</p>
			{/if}
			{@render children?.()}
		</div>
		<div class="actions">
			<Button variant="secondary" onclick={onCancel} fill size="small">{displayCancelLabel}</Button>
			<Button variant={confirmVariant} onclick={onConfirm} fill size="small"
				>{displayConfirmLabel}</Button
			>
		</div>
	</div>
</div>

<style>
	/* Portal wrapper handles stacking context */
	.confirmation-portal {
		position: relative;
		z-index: var(--z-popover);
	}

	.backdrop {
		position: fixed;
		inset: 0;
		/* Same z-index as portal/dialog base, but DOM order puts it behind dialog */
		z-index: var(--z-popover);
		background: var(--overlay-backdrop);
		backdrop-filter: blur(4px);
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

	.confirmation-dialog {
		position: fixed;
		/* Ensure dialog sits above backdrop */
		z-index: calc(var(--z-popover) + 1);
		--dialog-max-height: min(70vh, 560px);
		max-height: var(--dialog-max-height);
		min-width: 280px;
		max-width: 320px;
		background: var(--surface-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-xl);
		padding: var(--spacing-3);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		overflow: hidden;
		transform: translateX(-50%);
		transform-origin: top center;
		animation: scaleIn 100ms ease-out forwards;
	}

	@keyframes scaleIn {
		from {
			opacity: 0;
			transform: translateX(-50%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) scale(1);
		}
	}

	/* When flipped vertically, position above click point */
	.confirmation-dialog.flip-y {
		transform: translateX(-50%) translateY(-100%);
		transform-origin: bottom center;
		animation: scaleInFlipped 100ms ease-out forwards;
	}

	@keyframes scaleInFlipped {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-100%) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(-100%) scale(1);
		}
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		min-height: 0;
		max-height: calc(var(--dialog-max-height) - var(--spacing-5));
		overflow-y: auto;
	}

	.title {
		margin: 0;
		color: var(--text-normal);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
	}

	.description {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		line-height: 1.5;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
		margin-top: var(--spacing-1);
	}

	:global(.name-list) {
		margin: var(--spacing-2) 0 0 var(--spacing-3);
		padding: 0 0 0 var(--spacing-2);
	}

	:global(.name-list li) {
		list-style: disc;
		color: var(--text-secondary);
		font-size: var(--font-size-sm);
		line-height: 1.4;
		margin-bottom: var(--spacing-1);
	}
</style>
