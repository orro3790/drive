<!--
@component
IconCircle - A colored circular background for icons.

Used for visual indicators in lists (notifications, shifts, bids, etc.)

Props:
- color: CSS variable for the accent color (e.g., '--status-success', '--interactive-accent')
- variant: Visual state variant ('default' | 'muted')
- size: Size variant ('sm' | 'md') - sm for mobile-optimized, md for default
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'default' | 'muted';
	type Size = 'sm' | 'md';

	let {
		color = '--interactive-accent',
		variant = 'default',
		size = 'md',
		children
	} = $props<{
		/** CSS variable for accent color (without var()) */
		color?: string;
		/** Visual variant */
		variant?: Variant;
		/** Size variant */
		size?: Size;
		/** Icon to display inside the circle */
		children: Snippet;
	}>();
</script>

<div class="icon-circle {variant} {size}" style="--icon-accent: var({color});" aria-hidden="true">
	{@render children()}
</div>

<style>
	.icon-circle {
		position: relative;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--icon-accent) 12%, transparent);
		color: var(--icon-accent);
	}

	/* Size: md (default) */
	.icon-circle.md {
		width: 36px;
		height: 36px;
	}

	.icon-circle.md :global(svg) {
		width: 20px;
		height: 20px;
	}

	/* Size: sm (compact) */
	.icon-circle.sm {
		width: 32px;
		height: 32px;
	}

	.icon-circle.sm :global(svg) {
		width: 18px;
		height: 18px;
	}

	/* Variant: muted (reduced opacity) */
	.icon-circle.muted {
		opacity: 0.65;
	}

	/* Mobile: slightly smaller */
	@media (max-width: 640px) {
		.icon-circle.md {
			width: 32px;
			height: 32px;
		}

		.icon-circle.md :global(svg) {
			width: 18px;
			height: 18px;
		}

		.icon-circle.sm {
			width: 28px;
			height: 28px;
		}

		.icon-circle.sm :global(svg) {
			width: 16px;
			height: 16px;
		}
	}
</style>
