<!-- File: src/lib/components/Button.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Button component props following Svelte 5 patterns
	 */
	type ButtonProps = {
		/** Content to render inside the button (required) - use snippets for flexible composition */
		children: Snippet;

		/** Visual style variant of the button */
		variant?:
			| 'primary' // Accent color for primary actions
			| 'secondary' // Bordered neutral for secondary actions
			| 'primary-inverted' // Outlined accent
			| 'secondary-inverted' // Subtle background
			| 'ghost' // Transparent background
			| 'ghost-dashed' // Transparent with dashed border (for create actions)
			| 'danger' // Error color for destructive actions
			| 'pill'; // Rounded rectangle tag style

		/** Size variant affecting padding and font size */
		size?: 'compact' | 'xs' | 'small' | 'standard' | 'large';

		/** Border radius application */
		rounded?: 'all' | 'top' | 'bottom' | 'left' | 'right' | 'none';

		/** Whether button should fill container width/height */
		fill?: boolean;

		/** Disabled state - prevents interaction */
		disabled?: boolean;

		/** Loading state - shows spinner and disables interaction */
		isLoading?: boolean;

		/** Selected/active state for toggle buttons */
		selected?: boolean;

		/** Disables hover/active animations for reduced motion */
		disableAnimations?: boolean;

		/** HTML button type attribute */
		type?: 'button' | 'submit' | 'reset';

		/** If provided, renders an anchor tag instead of button */
		href?: string;

		/** Click handler */
		onclick?: (event: MouseEvent) => void;

		/** Associates button with a form (for submit buttons) */
		form?: string;

		/** ARIA label for accessibility */
		'aria-label'?: string;
		/** ARIA pressed state for toggle buttons */
		'aria-pressed'?: boolean;

		/** Additional CSS classes */
		class?: string;

		/** Element ID */
		id?: string;

		/** Inline styles */
		style?: string;

		/** ARIA role override */
		role?: string;

		/** Tab index for keyboard navigation */
		tabindex?: number;
	};

	let {
		children,
		variant = 'primary',
		size = 'standard',
		rounded = 'all',
		fill = false,
		disabled = false,
		isLoading = $bindable(false),
		selected = $bindable(false),
		disableAnimations = false,
		type = 'button',
		href,
		onclick,
		form,
		'aria-label': ariaLabel,
		'aria-pressed': ariaPressed,
		class: className,
		id,
		style,
		role,
		tabindex
	}: ButtonProps = $props();

	const classes = $derived(
		`btn ${variant} ${size} ${fill ? 'fill' : ''} ${selected ? 'selected' : ''} ${
			disableAnimations ? 'no-anim' : ''
		} rounded-${rounded} ${className || ''}`.trim()
	);
</script>

{#if href}
	<a
		{href}
		class={classes}
		{onclick}
		class:disabled={disabled || isLoading}
		aria-label={ariaLabel}
		aria-pressed={ariaPressed ?? undefined}
		{id}
		{style}
		{role}
		{tabindex}
	>
		<div class="content-wrapper" class:loading={isLoading}>
			<!-- Keep children for sizing, hide when loading -->
			<span class="content" class:hidden={isLoading}>
				{@render children()}
			</span>
			{#if isLoading}
				<div class="spinner-overlay">
					<div class="spinner"></div>
				</div>
			{/if}
		</div>
	</a>
{:else}
	<button
		{type}
		{form}
		class={classes}
		disabled={disabled || isLoading}
		{onclick}
		aria-label={ariaLabel}
		aria-pressed={ariaPressed ?? undefined}
		{id}
		{style}
		{role}
		{tabindex}
	>
		<div class="content-wrapper" class:loading={isLoading}>
			<!-- Keep children for sizing, hide when loading -->
			<span class="content" class:hidden={isLoading}>
				{@render children()}
			</span>
			{#if isLoading}
				<div class="spinner-overlay">
					<div class="spinner"></div>
				</div>
			{/if}
		</div>
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-family-base);
		cursor: pointer;
		transition: var(--transition-all);
		text-decoration: none;
		flex-shrink: 0;
		white-space: nowrap;

		/* Variant tokens (set by variant classes) */
		--btn-bg: transparent;
		--btn-fg: var(--text-normal);
		--btn-hover-bg: var(--btn-bg);
		--btn-hover-fg: var(--btn-fg);
		--btn-border: none;
		--btn-shadow: none;

		background-color: var(--btn-bg);
		color: var(--btn-fg);
		border: var(--btn-border);
		box-shadow: var(--btn-shadow);
	}

	.btn:hover {
		background-color: var(--btn-hover-bg);
		color: var(--btn-hover-fg);
	}

	/* Rounded variants using the theme border-radius */
	.rounded-top {
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	}

	.rounded-bottom {
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}

	.rounded-left {
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
	}

	.rounded-right {
		border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
	}

	.rounded-all {
		border-radius: var(--radius-base);
	}

	.rounded-none {
		border-radius: 0;
	}

	/* Content wrapper for consistent alignment */
	.content-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-1);
		min-width: max-content; /* Prevent content collapse */
		position: relative;
	}

	/* Content container - stays in flow for sizing */
	.content {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-1);
	}

	/* Hide content visually but keep for sizing */
	.content.hidden {
		visibility: hidden;
	}

	/* Size variants - min dimensions prevent collapse when showing spinner */
	.standard {
		padding: var(--spacing-2);
		font-size: var(--font-size-base);
		min-height: 36px;
	}

	.small {
		padding: var(--spacing-1) var(--spacing-2);
		font-size: var(--font-size-base);
		min-height: 32px;
	}

	.compact {
		padding: var(--spacing-1) var(--spacing-2);
		font-size: var(--font-size-sm);
		min-height: 28px;
	}

	.xs {
		padding: var(--spacing-1) var(--spacing-1-5);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-sm);
		min-height: 26px;
	}

	.large {
		padding: var(--spacing-3) var(--spacing-4);
		font-size: var(--font-size-base);
		min-height: 44px;
	}

	/* Disable animations mode */
	.btn.no-anim {
		transition: none;
	}

	/* Button variants using theme colors */
	.btn.primary {
		--btn-bg: var(--interactive-accent);
		--btn-fg: var(--text-on-accent);
		--btn-hover-bg: var(--interactive-accent-hover);
	}

	.btn.secondary {
		--btn-bg: var(--interactive-normal);
		--btn-fg: var(--text-normal);
		--btn-hover-bg: var(--interactive-hover);
		--btn-shadow: inset 0 0 0 var(--border-width-thin) var(--border-primary);
	}

	.btn.primary-inverted {
		--btn-bg: transparent;
		--btn-fg: var(--interactive-accent);
		--btn-hover-bg: var(--interactive-accent);
		--btn-hover-fg: var(--text-on-accent);
		--btn-border: var(--border-width-thin) solid var(--interactive-accent);
	}

	.btn.secondary-inverted {
		--btn-bg: var(--surface-inset);
		--btn-fg: var(--text-normal);
		--btn-hover-bg: var(--surface-secondary);
		--btn-border: var(--border-width-thin) solid var(--border-primary);
	}

	.btn.ghost {
		--btn-bg: transparent;
		--btn-fg: var(--text-muted);
		--btn-hover-bg: var(--interactive-hover);
		--btn-hover-fg: var(--text-normal);
	}

	.btn.ghost-dashed {
		--btn-bg: transparent;
		--btn-fg: var(--text-muted);
		--btn-hover-bg: var(--interactive-hover);
		--btn-hover-fg: var(--text-normal);
		--btn-border: var(--border-width-thin) dashed var(--border-primary);
	}

	.btn.pill {
		--btn-bg: var(--interactive-hover);
		--btn-fg: var(--text-normal);
		--btn-border: var(--border-width-thin) solid var(--border-primary);
		border-radius: var(--radius-lg);
	}

	/* Remove internal gap for pill content and rely on icon margin for spacing */
	.pill .content-wrapper {
		gap: 0;
	}

	/* Apply spacing only to the direct icon wrapper, not inner SVGs */
	.pill .content-wrapper > :global(.icon) {
		margin-left: var(--spacing-2);
	}

	.btn.danger {
		--btn-bg: color-mix(in srgb, var(--status-error) 88%, var(--surface-primary));
		--btn-fg: var(--text-on-accent);
		--btn-hover-bg: color-mix(in srgb, var(--status-error) 96%, var(--surface-primary));
	}

	/* Selected state */
	.btn.selected {
		--btn-bg: var(--interactive-accent-hover);
		--btn-fg: var(--text-on-accent);
		--btn-hover-bg: var(--interactive-accent-hover);
		--btn-hover-fg: var(--text-on-accent);
	}

	/* Fill variant - uses flex: 1 to share space in flex containers */
	.fill {
		width: 100%;
		flex: 1 1 0%;
	}

	/* Loading spinner - positioned absolutely to not affect button size */
	.spinner-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: var(--border-width-thin) solid currentColor;
		border-top-color: transparent;
		border-radius: var(--radius-full);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Disabled state */
	.btn:disabled,
	.btn.disabled {
		cursor: not-allowed;
		opacity: 0.6;
		pointer-events: none;
	}

	/* Touch target expansion for mobile accessibility (WCAG 2.5.5) */
	@media (pointer: coarse), (hover: none) {
		.btn.xs,
		.btn.compact,
		.btn.small,
		.btn.standard {
			min-height: 44px;
		}
	}
</style>
