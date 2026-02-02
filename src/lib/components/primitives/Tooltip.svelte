<!-- File: src/lib/components/Tooltip.svelte -->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { portalWithPosition } from '$lib/actions/portal';
	import type { TooltipPosition } from '$lib/schemas/tooltip';
	import type { Snippet } from 'svelte';

	// Props
	let {
		tooltip = false,
		position = 'top',
		delay = 1000,
		fallbackToSide = false,
		anchorSelector,
		children,
		focusable = true,
		maxWidth = '260px',
		content
	} = $props<{
		tooltip?: string | boolean;
		position?: TooltipPosition;
		delay?: number;
		fallbackToSide?: boolean;
		anchorSelector?: string;
		children?: Snippet;
		focusable?: boolean;
		maxWidth?: string;
		content?: Snippet;
	}>();

	const displayAriaLabel = $derived(
		focusable && typeof tooltip === 'string' ? m.tooltip_aria_show({ tooltip }) : undefined
	);

	let showTooltip = $state(false);
	let isHovering = $state(false);
	let isPositioned = $state(false);
	let wrapperElement = $state<HTMLElement>();
	let tooltipElement = $state<HTMLElement>();

	// Touch device detection (runs on client mount)
	let isTouchDevice = $state(false);
	$effect(() => {
		isTouchDevice =
			window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
	});

	const triggerElement: HTMLElement | null = $derived(
		wrapperElement
			? anchorSelector
				? (wrapperElement.querySelector(anchorSelector) as HTMLElement | null)
				: wrapperElement.firstElementChild instanceof HTMLElement
					? (wrapperElement.firstElementChild as HTMLElement)
					: null
			: null
	);

	function handleMouseEnter() {
		if (isTouchDevice) return;
		isPositioned = false;
		isHovering = true;
	}

	function handleMouseLeave() {
		if (isTouchDevice) return;
		isHovering = false;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			isHovering = false;
		}
	}

	/**
	 * Hide the tooltip immediately and reset hover state.
	 */
	function hideTooltip() {
		isHovering = false;
		showTooltip = false;
	}

	$effect(() => {
		let timeoutId: ReturnType<typeof setTimeout>;

		if (isHovering) {
			timeoutId = setTimeout(() => {
				showTooltip = true;
			}, delay);
		} else {
			showTooltip = false;
		}

		// Svelte automatically calls this cleanup function when isHovering or delay changes,
		// or when the component is unmounted. This prevents memory leaks and race conditions.
		return () => {
			clearTimeout(timeoutId);
		};
	});

	$effect(() => {
		if (!wrapperElement) {
			return;
		}

		function handleGlobalPointerDown(event: PointerEvent) {
			if (!wrapperElement?.contains(event.target as Node)) {
				hideTooltip();
			}
		}

		function handleVisibilityChange() {
			if (document.hidden) {
				hideTooltip();
			}
		}

		window.addEventListener('pointerdown', handleGlobalPointerDown, true);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	// No need for complex arrow offset calculation - CSS will handle centering
</script>

<div
	bind:this={wrapperElement}
	class="tooltip-wrapper"
	role={focusable ? 'button' : undefined}
	{...focusable
		? {
				tabindex: 0
			}
		: {}}
	aria-label={displayAriaLabel}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onfocus={handleMouseEnter}
	onblur={handleMouseLeave}
	onkeydown={handleKeyDown}
>
	{@render children?.()}
</div>

{#if tooltip && showTooltip && triggerElement}
	<div
		bind:this={tooltipElement}
		class="tooltip"
		class:animate-in={isPositioned}
		data-actual-position={position}
		role="tooltip"
		aria-describedby="tooltip-content"
		style:--tooltip-max-width={maxWidth}
		use:portalWithPosition={{
			position,
			spacing: 8, // --spacing-2 = 8px
			triggerElement,
			fallbackToSide,
			onPositioned: () => {
				isPositioned = true;
			}
		}}
	>
		<div id="tooltip-content" class="tooltip-content">
			{#if content}
				{@render content()}
			{:else}
				{tooltip}
			{/if}
		</div>
		<div class="tooltip-arrow"></div>
	</div>
{/if}

<style>
	.tooltip-wrapper {
		/* This is the key to the fix. `display: contents` makes the wrapper element
		 * "disappear" from the layout, so it doesn't add any extra space or
		 * interfere with flex/grid layouts. Its children behave as if they are
		 * direct children of the wrapper's parent. */
		display: contents;
	}

	.tooltip {
		position: fixed;
		z-index: var(--z-popover);
		pointer-events: none;
		box-shadow: var(--shadow-base);
		display: inline-flex;
		flex-direction: column;
		width: max-content;
		max-width: var(--tooltip-max-width, 260px);
		/* Removed initial opacity and transform to prevent incorrect getBoundingClientRect() */
	}

	.tooltip.animate-in {
		animation: tooltipBounceIn 280ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
	}

	.tooltip-content {
		background: var(--surface-inset);
		color: var(--text-normal);
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-base);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		line-height: 1.4;
		white-space: pre-wrap;
		border: 1px solid var(--border-primary);
		text-align: left;
	}

	.tooltip-arrow {
		position: absolute;
		width: 6px;
		height: 6px;
		background: var(--surface-inset);
		border: 1px solid var(--border-primary);
		border-top: none;
		border-left: none;
		transform: rotate(45deg);
	}

	/* Arrow positioning based on tooltip position */
	.tooltip[data-actual-position='top'] .tooltip-arrow {
		bottom: -3px;
		left: 50%;
		transform: translateX(-50%) rotate(45deg);
	}

	.tooltip[data-actual-position='bottom'] .tooltip-arrow {
		top: -3px;
		left: 50%;
		transform: translateX(-50%) rotate(225deg);
	}

	.tooltip[data-actual-position='left'] .tooltip-arrow {
		right: -3px;
		top: 50%;
		transform: translateY(-50%) rotate(315deg);
	}

	.tooltip[data-actual-position='right'] .tooltip-arrow {
		left: -3px;
		top: 50%;
		transform: translateY(-50%) rotate(135deg);
	}

	/* Bounce animation similar to class-icon-badge */
	@keyframes tooltipBounceIn {
		0% {
			opacity: 0;
			transform: scale(0.8);
		}
		60% {
			opacity: 1;
			transform: scale(1.05);
		}
		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Ensure tooltip wrapper fills grid cell */
	:global(.actions .tooltip-wrapper) {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Disable tooltips on touch devices where hover is unreliable */
	@media (hover: none) {
		.tooltip {
			display: none !important;
		}
	}
</style>
