<!--
@component
A 28×28px icon-only button with tooltip support and multiple visual states.

**Props:**
- `tooltip`: string — text for tooltip (also used as aria-label)
- `disableTooltip?`: boolean — suppress tooltip display
- `disabled?`: boolean — native disabled (non-interactive, dimmed)
- `ariaDisabled?`: boolean — visually disabled but still clickable (for toast feedback)
- `position?`: TooltipPosition — tooltip position ('top' | 'bottom' | 'left' | 'right')
- `delay?`: number — tooltip delay in ms (default 1000)
- `type?`: 'button' | 'submit' | 'reset' — button type attribute
- `isActive?`: boolean — active/pressed visual state (highlighted background)
- `display?`: boolean — render as non-interactive span (for status indicators)
- `noBackground?`: boolean — no background on hover, only color change
- `attention?`: boolean — animated border ring to draw user attention
- `successFeedback?`: boolean — show success state with green bg on click
- `successMessage?`: string — custom tooltip during success state
- `ariaPressed?`, `ariaExpanded?`, `ariaControls?`, `aria-haspopup?`: ARIA attributes for toggles/menus
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Tooltip from '$lib/components/primitives/Tooltip.svelte';
	import type { TooltipPosition } from '$lib/schemas/tooltip';

	// Props
	let {
		tooltip,
		disableTooltip = false,
		onclick,
		onmouseenter,
		onmouseleave,
		disabled = false,
		ariaDisabled = false,
		'aria-label': ariaLabel,
		position = 'top',
		delay = 1000,
		type = 'button',
		isActive = false,
		display = false,
		noBackground = false,
		attention = false,
		ariaPressed = undefined as boolean | undefined,
		ariaExpanded = undefined as boolean | undefined,
		ariaControls = undefined as string | undefined,
		'aria-haspopup': ariaHaspopup = undefined as string | boolean | undefined,
		successFeedback = false,
		successMessage = undefined as string | undefined,
		children,
		ref
	} = $props<{
		tooltip: string;
		disableTooltip?: boolean;
		onclick?: (event: MouseEvent) => void;
		onmouseenter?: (event: MouseEvent) => void;
		onmouseleave?: (event: MouseEvent) => void;
		disabled?: boolean;
		ariaDisabled?: boolean;
		'aria-label'?: string;
		position?: TooltipPosition;
		delay?: number;
		type?: 'button' | 'submit' | 'reset';
		isActive?: boolean;
		display?: boolean;
		noBackground?: boolean;
		attention?: boolean;
		ariaPressed?: boolean;
		ariaExpanded?: boolean;
		ariaControls?: string;
		'aria-haspopup'?: string | boolean;
		successFeedback?: boolean;
		successMessage?: string;
		children: Snippet;
		ref?: (el: HTMLButtonElement) => void;
	}>();

	// Success feedback state
	let isSuccess = $state(false);
	let successResetTimeout: ReturnType<typeof setTimeout> | undefined;

	function clearSuccessTimeout() {
		if (successResetTimeout) {
			clearTimeout(successResetTimeout);
			successResetTimeout = undefined;
		}
	}

	function handleClick(event: MouseEvent) {
		clearSuccessTimeout();
		if (successFeedback && !disabled && !ariaDisabled) {
			isSuccess = true;
		}
		onclick?.(event);
	}

	function handleMouseEnter(event: MouseEvent) {
		clearSuccessTimeout();
		onmouseenter?.(event);
	}

	function handleMouseLeave(event: MouseEvent) {
		// Clear success state after linger duration when mouse leaves
		if (isSuccess) {
			clearSuccessTimeout();
			successResetTimeout = setTimeout(() => {
				isSuccess = false;
				successResetTimeout = undefined;
			}, 1000);
		}
		onmouseleave?.(event);
	}

	// Compute effective tooltip - show success message during success state
	const effectiveTooltip = $derived(
		isSuccess && successFeedback ? (successMessage ?? `${tooltip} ✓`) : tooltip
	);

	// Force tooltip to show immediately during success state
	const effectiveDelay = $derived(isSuccess ? 0 : delay);
	let buttonRef = $state<HTMLButtonElement | null>(null);

	function setRef(node: HTMLButtonElement) {
		ref?.(node);
	}
</script>

<Tooltip
	tooltip={disableTooltip || display ? false : effectiveTooltip}
	{position}
	delay={effectiveDelay}
	focusable={false}
>
	{#if display}
		<span class="icon-button display-only" role="presentation" aria-hidden="true">
			{@render children()}
		</span>
	{:else}
		<button
			bind:this={buttonRef}
			use:setRef
			{type}
			class="icon-button"
			class:active={isActive}
			class:no-background={noBackground}
			class:aria-disabled={ariaDisabled}
			class:attention
			class:success={isSuccess && successFeedback}
			{disabled}
			onclick={handleClick}
			onmouseenter={handleMouseEnter}
			onmouseleave={handleMouseLeave}
			aria-label={ariaLabel || tooltip}
			aria-pressed={ariaPressed}
			aria-expanded={ariaExpanded}
			aria-controls={ariaControls}
			aria-haspopup={ariaHaspopup}
			aria-disabled={ariaDisabled}
		>
			{@render children()}
		</button>
	{/if}
</Tooltip>

<style>
	.icon-button {
		background: none;
		border: none;
		border-radius: var(--radius-lg);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		color: var(--text-muted);
		transition:
			background-color 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}

	.icon-button:hover:not(:disabled):not(.active):not(.aria-disabled):not(.no-background):not(
			.success
		) {
		background: color-mix(in srgb, var(--text-normal) 8%, transparent);
		color: var(--text-normal);
	}

	.icon-button.active:not(.no-background):not(.success) {
		background: color-mix(in srgb, var(--text-normal) 10%, transparent);
		color: var(--text-normal);
	}

	/* Success feedback state - green background with white icon */
	.icon-button.success {
		background: var(--status-success);
		color: #fff;
	}

	/* No background variant - only color changes on hover */
	.icon-button.no-background:hover:not(:disabled):not(.aria-disabled) {
		color: var(--text-normal);
	}

	.icon-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.icon-button.aria-disabled {
		opacity: 0.5;
		/* Keep pointer cursor to indicate click is possible (for toasts) */
		cursor: pointer;
	}

	/* Display-only mode: no interaction, no hover */
	.icon-button.display-only {
		pointer-events: none;
		cursor: default;
	}

	.icon-button.attention {
		position: relative;
		isolation: isolate;
	}

	.icon-button.attention::before,
	.icon-button.attention::after {
		--pulse-angle: 0deg;
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: inherit;
		box-sizing: border-box;
		background-image: conic-gradient(
			from var(--pulse-angle),
			transparent 20%,
			var(--interactive-accent-muted) 30%,
			var(--interactive-accent) 35%,
			transparent 40%,
			transparent 70%,
			var(--interactive-accent-muted) 80%,
			var(--interactive-accent) 85%,
			transparent 90%
		);
		animation: icon-attention-spin 6s linear infinite;
		z-index: -1;
		pointer-events: none;
		/* Hollow out the center to create a ring effect */
		padding: 2px;
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
		-webkit-mask-composite: xor;
	}

	.icon-button.attention::before {
		filter: blur(0.5rem);
		opacity: 0.6;
	}

	.icon-button.attention::after {
		opacity: 1;
	}

	@property --pulse-angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}

	@keyframes icon-attention-spin {
		from {
			--pulse-angle: 0deg;
		}
		to {
			--pulse-angle: 360deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.icon-button.attention::before,
		.icon-button.attention::after {
			animation: none;
		}
	}

	/* Touch target expansion for mobile accessibility (WCAG 2.5.5) */
	@media (pointer: coarse), (hover: none) {
		.icon-button {
			min-width: 44px;
			min-height: 44px;
		}
	}
</style>
