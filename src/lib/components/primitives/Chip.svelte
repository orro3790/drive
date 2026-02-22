<script lang="ts">
	/**
	 * @component Chip
	 * A versatile chip/badge component for labels, tags, and status indicators.
	 *
	 * @prop {string} label - Text content of the chip.
	 * @prop {'default' | 'status' | 'tag' | 'code'} [variant='default'] - Visual style variant.
	 * @prop {ChipStatus} [status] - Semantic color status (info/success/warning/error/neutral/new/good/fair/poor).
	 * @prop {string} [color] - Custom border/accent color (primarily for 'tag' variant).
	 * @prop {boolean} [clickable=false] - If true, renders as a button element.
	 * @prop {boolean} [selected=false] - Selected/active state.
	 * @prop {(event: MouseEvent) => void} [onClick] - Click handler.
	 * @prop {Snippet} [icon] - Leading icon snippet.
	 * @prop {string} [maxLabelWidth='100%'] - Max width for label truncation.
	 * @prop {string} [ariaLabel] - Accessible label override.
	 * @prop {'xs' | 'sm' | 'md'} [size='sm'] - Size variant.
	 */
	import type { Snippet } from 'svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';

	type ChipVariant = 'default' | 'status' | 'tag' | 'code';
	/**
	 * Semantic status values for chip coloring.
	 * - info/success/warning/error: Standard semantic statuses
	 * - neutral: Grey/muted default state
	 * - new/good/fair/poor: Material condition values (green → orange → red gradient)
	 */
	export type ChipStatus =
		| 'info'
		| 'success'
		| 'warning'
		| 'error'
		| 'neutral'
		| 'new'
		| 'good'
		| 'fair'
		| 'poor';
	type ChipSize = 'xs' | 'sm' | 'md';

	let {
		label,
		variant = 'default',
		status,
		color,
		clickable = false,
		selected = false,
		onClick,
		onDismiss,
		icon = null,
		maxLabelWidth = '100%',
		ariaLabel,
		size = 'sm'
	}: {
		label: string;
		variant?: ChipVariant;
		status?: ChipStatus;
		color?: string;
		clickable?: boolean;
		selected?: boolean;
		onClick?: (event: MouseEvent) => void;
		onDismiss?: () => void;
		icon?: Snippet | null;
		maxLabelWidth?: string;
		ariaLabel?: string;
		size?: ChipSize;
	} = $props();

	const isButton = $derived(clickable || typeof onClick === 'function');
</script>

<svelte:element
	this={isButton ? 'button' : 'span'}
	type={isButton ? 'button' : undefined}
	class="chip"
	class:clickable={isButton}
	class:selected
	class:status={variant === 'status'}
	class:tag={variant === 'tag'}
	class:code={variant === 'code'}
	class:custom-color={!!color}
	class:size-xs={size === 'xs'}
	class:size-sm={size === 'sm'}
	class:size-md={size === 'md'}
	style={color
		? `--chip-color:${color};--chip-max-label:${maxLabelWidth};`
		: `--chip-max-label:${maxLabelWidth};`}
	role={isButton ? 'button' : undefined}
	aria-label={ariaLabel}
	aria-pressed={isButton ? selected : undefined}
	data-status={status}
	onclick={isButton ? (e: MouseEvent) => onClick?.(e) : undefined}
>
	{@render icon?.()}
	<span class="chip-label">{label}</span>
	{#if onDismiss}
		<button
			type="button"
			class="chip-dismiss"
			aria-label="Remove"
			onclick={(e) => {
				e.stopPropagation();
				onDismiss();
			}}
		>
			<XIcon />
		</button>
	{/if}
</svelte:element>

<style>
	/* === Base Chip === */
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		padding: 0 var(--spacing-2);
		border-radius: var(--radius-lg);
		background: var(--surface-primary);
		color: var(--text-normal);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		transition: var(--transition-all);
		text-transform: none;
	}

	/* === Size Variants === */
	.chip.size-xs {
		padding: 0 var(--spacing-half);
		font-size: var(--font-size-xs);
	}

	.chip.size-sm {
		padding: 0 var(--spacing-1);
		font-size: var(--font-size-sm);
	}

	.chip.size-md {
		padding: 0 var(--spacing-3);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-normal);
	}

	/* === Interactive States === */
	.chip.clickable {
		cursor: pointer;
		background: var(--interactive-normal);
	}

	.chip.clickable:hover {
		background: var(--interactive-hover);
	}

	.chip.selected {
		background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
	}

	/* === Status Variant === */
	.chip.status {
		text-transform: capitalize;
		padding: 2px var(--spacing-2);
	}

	/* === Tag Variant === */
	.chip.tag {
		background: var(--interactive-normal);
		color: var(--text-normal);
		padding: 2px var(--spacing-2);
	}

	/* === Code Variant === */
	.chip.code {
		font-family: var(--font-family-mono);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
		padding: 2px var(--spacing-2);
		border-radius: var(--radius-base);
		letter-spacing: 0.05em;
	}

	/* === Status Colors (applies to all variants with status prop) === */
	.chip[data-status='info'] {
		background: color-mix(in srgb, var(--status-info) 12%, transparent);
		color: var(--status-info);
	}
	:global([data-theme='dark']) .chip[data-status='info'] {
		background: color-mix(in srgb, var(--status-info) 15%, transparent);
		color: var(--status-info-light, #93c5fd);
	}

	.chip[data-status='success'] {
		background: color-mix(in srgb, var(--status-success) 12%, transparent);
		color: var(--status-success);
	}
	:global([data-theme='dark']) .chip[data-status='success'] {
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		color: var(--status-success-light, #86efac);
	}

	.chip[data-status='warning'] {
		background: color-mix(in srgb, var(--status-warning) 12%, transparent);
		color: var(--status-warning);
	}
	:global([data-theme='dark']) .chip[data-status='warning'] {
		background: color-mix(in srgb, var(--status-warning) 15%, transparent);
		color: var(--status-warning-light, var(--status-warning));
	}

	.chip[data-status='error'] {
		background: color-mix(in srgb, var(--status-error) 12%, transparent);
		color: var(--status-error);
	}
	:global([data-theme='dark']) .chip[data-status='error'] {
		background: color-mix(in srgb, var(--status-error) 15%, transparent);
		color: var(--status-error-light, #fca5a5);
	}

	/* Neutral: grey/muted default state */
	.chip[data-status='neutral'] {
		background: var(--interactive-normal);
		color: var(--text-muted);
	}
	:global([data-theme='dark']) .chip[data-status='neutral'] {
		background: var(--interactive-normal);
		color: var(--text-muted);
	}

	/* Condition statuses: new → good → fair → poor (green → orange → red gradient) */
	.chip[data-status='new'],
	.chip[data-status='good'] {
		background: color-mix(in srgb, var(--status-success) 12%, transparent);
		color: var(--status-success);
	}
	:global([data-theme='dark']) .chip[data-status='new'],
	:global([data-theme='dark']) .chip[data-status='good'] {
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		color: var(--status-success-light, #86efac);
	}

	.chip[data-status='fair'] {
		background: color-mix(in srgb, var(--status-warning) 12%, transparent);
		color: var(--status-warning);
	}
	:global([data-theme='dark']) .chip[data-status='fair'] {
		background: color-mix(in srgb, var(--status-warning) 15%, transparent);
		color: var(--status-warning-light, var(--status-warning));
	}

	.chip[data-status='poor'] {
		background: color-mix(in srgb, var(--status-error) 12%, transparent);
		color: var(--status-error);
	}
	:global([data-theme='dark']) .chip[data-status='poor'] {
		background: color-mix(in srgb, var(--status-error) 15%, transparent);
		color: var(--status-error-light, #fca5a5);
	}

	/* === Dismiss Button === */
	.chip-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		margin: 0;
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity var(--transition-fast);
	}

	.chip-dismiss:hover {
		opacity: 1;
	}

	.chip-dismiss :global(svg) {
		width: 12px;
		height: 12px;
	}

	/* === Label Truncation === */
	.chip-label {
		max-width: var(--chip-max-label, 100%);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* === Custom Color === */
	.chip.custom-color {
		background: color-mix(in srgb, var(--chip-color) 12%, transparent);
		color: var(--chip-color);
		border-color: color-mix(in srgb, var(--chip-color) 20%, transparent);
	}

	/* Tag text should remain normal color; only the icon inherits the custom color */
	.chip.custom-color.tag .chip-label {
		color: var(--text-normal);
	}

	.chip.custom-color.code {
		background: color-mix(in srgb, var(--chip-color) 12%, transparent);
		color: var(--chip-color);
	}
</style>
