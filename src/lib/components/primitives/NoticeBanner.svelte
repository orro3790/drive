<!--
  File: src/lib/components/primitives/NoticeBanner.svelte
  A reusable notice/alert banner with variant styles.
  
  Variants:
  - warning: Orange/amber, exclamation icon
  - success: Green, check circle icon
  - accent: Brand accent color, announcement icon
  - normal: Neutral, announcement icon
  
  Can pass a custom icon via the `icon` snippet.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import Exclamation from '$lib/components/icons/Exclamation.svelte';
	import CircleCheckFill from '$lib/components/icons/CircleCheckFill.svelte';
	import Announcement from '$lib/components/icons/Announcement.svelte';

	type Variant = 'warning' | 'success' | 'accent' | 'normal' | 'info';
	type IconSize = 'normal' | 'large';
	type Alignment = 'start' | 'center';

	let {
		variant = 'warning',
		icon,
		iconSize = 'normal',
		align = 'center',
		children
	} = $props<{
		/** The visual variant of the banner */
		variant?: Variant;
		/** Custom icon snippet (overrides variant normal) */
		icon?: Snippet;
		/** Icon size (normal: 18px, large: 24px) */
		iconSize?: IconSize;
		/** Vertical alignment of icon relative to content (default: center) */
		align?: Alignment;
		/** Banner content */
		children: Snippet;
	}>();

	// Map NoticeBanner iconSize to Icon component size prop
	// normal (18px) -> small (18px)
	// large (24px) -> large (24px)
	const mappedIconSize = $derived(iconSize === 'large' ? 'large' : 'small');
</script>

<div class="notice-banner {variant} align-{align}" role="note">
	<div class="notice-icon {iconSize}">
		{#if icon}
			{@render icon()}
		{:else if variant === 'warning'}
			<Icon size={mappedIconSize}><Exclamation /></Icon>
		{:else if variant === 'success'}
			<Icon size={mappedIconSize}><CircleCheckFill /></Icon>
		{:else}
			<Icon size={mappedIconSize}><Announcement /></Icon>
		{/if}
	</div>
	<div class="notice-content">
		{@render children()}
	</div>
</div>

<style>
	.notice-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-3);
		padding: var(--spacing-3) var(--spacing-3);
		border-radius: var(--radius-lg);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		letter-spacing: var(--letter-spacing-sm);
	}

	.notice-banner.align-start {
		align-items: flex-start;
	}

	.notice-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	/* Target raw SVGs */
	.notice-icon :global(svg) {
		width: 18px;
		height: 18px;
	}

	/* Target Icon component wrapper to override its default size */
	.notice-icon :global(.icon) {
		width: 18px;
		height: 18px;
	}

	.notice-icon.large :global(svg) {
		width: 24px;
		height: 24px;
	}

	/* Override Icon component wrapper size when large */
	.notice-icon.large :global(.icon) {
		width: 24px;
		height: 24px;
	}

	.notice-content {
		flex: 1;
		min-width: 0;
	}

	/* Variant: warning (amber/orange) */
	.notice-banner.warning {
		background: color-mix(in srgb, var(--status-warning, #ec7d10) 10%, transparent);
		color: var(--status-warning, #ec7d10);
	}

	.notice-banner.warning .notice-icon {
		color: var(--status-warning, #ec7d10);
	}

	/* Variant: success (green) */
	.notice-banner.success {
		background: color-mix(in srgb, var(--status-success, #22c55e) 10%, transparent);
		color: var(--status-success, #22c55e);
	}

	.notice-banner.success .notice-icon {
		color: var(--status-success, #22c55e);
	}

	/* Variant: accent (brand color) */
	.notice-banner.accent {
		background: color-mix(in srgb, var(--interactive-accent, #6366f1) 8%, transparent);
		color: var(--interactive-accent, #6366f1);
	}

	.notice-banner.accent .notice-icon {
		color: var(--interactive-accent, #6366f1);
	}

	.notice-banner.accent :global(.banner-content),
	.notice-banner.accent :global(p),
	.notice-banner.accent :global(span) {
		color: var(--text-normal);
	}

	.notice-banner.accent :global(h3) {
		color: var(--interactive-accent);
	}

	/* Variant: normal (neutral) */
	.notice-banner.normal {
		background: color-mix(in srgb, var(--text-normal, #dcddde) 7%, transparent);
		color: var(--text-normal);
	}

	.notice-banner.normal .notice-icon {
		color: var(--text-normal);
	}

	/* Variant: info (blue) */
	.notice-banner.info {
		background: color-mix(in srgb, var(--status-info, #3b82f6) 10%, transparent);
		color: var(--status-info, #3b82f6);
	}

	.notice-banner.info .notice-icon {
		color: var(--status-info, #3b82f6);
	}
</style>
