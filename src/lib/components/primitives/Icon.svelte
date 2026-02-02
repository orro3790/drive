<!--
@component
A wrapper for applying consistent sizing and styling to SVG icons.

Props:
- fill: boolean — if true, icon expands to fill parent container (parent must define dimensions)
- size: 'small' | 'medium' | 'large' — explicit size (18px, 20px, 24px). Ignored if fill=true. Default: 'small' (18px)
- color: string — icon color (default: currentColor)
- class: string — additional CSS classes
- ariaHidden: boolean — whether to hide from screen readers (default: true)
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		fill?: boolean;
		size?: 'small' | 'medium' | 'large';
		color?: string;
		class?: string;
		children: Snippet;
		ariaHidden?: boolean;
	}

	const {
		fill = false,
		size = 'small',
		color = 'currentColor',
		class: className = '',
		children,
		ariaHidden = true
	}: Props = $props();
</script>

<span class="icon {size} {className}" class:fill aria-hidden={ariaHidden} style:color>
	{@render children()}
</span>

<style>
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.icon.medium {
		width: 20px;
		height: 20px;
	}

	.icon.large {
		width: 24px;
		height: 24px;
	}

	/* Fill mode: icon expands to parent container dimensions */
	.icon.fill {
		width: 100%;
		height: 100%;
		min-width: unset;
		min-height: unset;
	}

	.icon :global(svg) {
		width: 100%;
		height: 100%;
		stroke-width: 2;
	}
</style>
