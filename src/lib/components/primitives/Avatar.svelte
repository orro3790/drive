<script lang="ts">
	import Icon from '$lib/components/primitives/Icon.svelte';
	import UserCircle from '$lib/components/icons/UserCircle.svelte';
	import { portal } from '$lib/actions/portal';

	let {
		src,
		fallbackSrc = null,
		alt,
		initials,
		size = '40px',
		border = true,
		class: className = '',
		hoverSrc = null,
		hoverLabel = null,
		hoverSize = 128
	}: {
		src?: string | null;
		/** Optional fallback source to use if the primary `src` fails to load (e.g., thumbnail 404). */
		fallbackSrc?: string | null;
		alt?: string;
		initials?: string;
		size?: string | number;
		border?: boolean;
		class?: string;
		/** Larger image URL to show on hover (e.g., full photo instead of thumbnail) */
		hoverSrc?: string | null;
		/** Label to show below the enlarged image (e.g., student name) */
		hoverLabel?: string | null;
		/** Size of the hover preview in pixels */
		hoverSize?: number;
	} = $props();

	// If size is a number, treat as px
	const sizeStr = $derived(typeof size === 'number' ? `${size}px` : size);

	// Local, mutable source so we can swap to fallback on load errors.
	// Initialized via effect to properly track `src` prop changes.
	let activeSrc = $state<string | null | undefined>(undefined);

	// Track which src values have failed so we don't reset to them on re-render.
	// This prevents flickering during reactive updates (e.g., column resize).
	let failedSrc = $state<string | null>(null);

	$effect(() => {
		// Only sync if the src actually changed to a new value we haven't failed on.
		// If the new src is the same as one that already failed, skip the reset
		// and keep the current fallback state.
		if (src !== failedSrc) {
			activeSrc = src;
			// Clear failed tracking when src changes to a genuinely new value
			if (failedSrc !== null) {
				failedSrc = null;
			}
		}
	});

	function handleImgError() {
		// Mark the current src as failed to prevent $effect from resetting to it
		if (activeSrc) {
			failedSrc = activeSrc;
		}

		// If we have a fallback, try it once.
		if (activeSrc && fallbackSrc && activeSrc !== fallbackSrc) {
			activeSrc = fallbackSrc;
			return;
		}
		// Otherwise, fall back to placeholder/initials
		activeSrc = null;
	}

	// Hover state for enlarged preview
	let isHovering = $state(false);
	let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
	let wrapperEl: HTMLDivElement | null = null;
	let showBelow = $state(false);
	let tooltipPosition = $state<{ top: number; left: number } | null>(null);

	// Only enable hover if we have a hover source or an active image to enlarge
	const canHover = $derived(hoverSrc || activeSrc);

	function handleMouseEnter() {
		if (!canHover) return;
		// Small delay to prevent flicker on quick mouse movements
		hoverTimeout = setTimeout(() => {
			// Check if there's enough space above for the tooltip
			if (wrapperEl) {
				const rect = wrapperEl.getBoundingClientRect();
				// Estimate tooltip height: image + label padding (~40px if label present)
				const tooltipHeight = hoverSize + (hoverLabel ? 40 : 0) + 8; // +8 for gap
				showBelow = rect.top < tooltipHeight;

				// Calculate fixed position for tooltip (escapes overflow:hidden)
				const centerX = rect.left + rect.width / 2;
				tooltipPosition = {
					left: centerX - hoverSize / 2,
					top: showBelow ? rect.bottom + 8 : rect.top - tooltipHeight
				};
			}
			isHovering = true;
		}, 150);
	}

	function handleMouseLeave() {
		if (hoverTimeout) {
			clearTimeout(hoverTimeout);
			hoverTimeout = null;
		}
		isHovering = false;
		showBelow = false;
		tooltipPosition = null;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="avatar-wrapper"
	bind:this={wrapperEl}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<div
		class="avatar-container {className}"
		class:has-border={border}
		style:width={sizeStr}
		style:height={sizeStr}
	>
		{#if activeSrc}
			<img src={activeSrc} {alt} class="avatar-image" onerror={handleImgError} />
		{:else}
			<div class="avatar-placeholder">
				{#if initials}
					<span class="initials" style:font-size="calc({sizeStr} * 0.4)">{initials}</span>
				{:else}
					<div
						class="icon-wrapper"
						style:width="calc({sizeStr} * 0.6)"
						style:height="calc({sizeStr} * 0.6)"
					>
						<Icon><UserCircle /></Icon>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if isHovering && canHover && tooltipPosition}
		<div
			class="avatar-hover-tooltip"
			class:below={showBelow}
			style:width="{hoverSize}px"
			style:top="{tooltipPosition.top}px"
			style:left="{tooltipPosition.left}px"
			use:portal
		>
			<div class="hover-image-container" style:height="{hoverSize}px">
				{#if hoverSrc || activeSrc}
					<img src={hoverSrc || activeSrc} alt={alt || hoverLabel || ''} class="hover-image" />
				{:else if initials}
					<div class="hover-placeholder">
						<span class="hover-initials">{initials}</span>
					</div>
				{/if}
			</div>
			{#if hoverLabel}
				<div class="hover-label">{hoverLabel}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.avatar-wrapper {
		position: relative;
		display: inline-block;
	}

	.avatar-container {
		position: relative;
		border-radius: var(--radius-full);
		overflow: hidden;
		flex-shrink: 0;
		background-color: var(--surface-secondary);
		isolation: isolate;
	}

	.avatar-container.has-border {
		border: 1px solid var(--border-muted);
		box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--surface-secondary);
		color: var(--text-muted);
	}

	.initials {
		font-weight: 600;
		line-height: 1;
		color: var(--text-normal);
		text-transform: uppercase;
	}

	.icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Hover tooltip styles - uses position:fixed to escape overflow:hidden */
	.avatar-hover-tooltip {
		position: fixed;
		z-index: var(--z-tooltip, 1000);
		background: var(--surface-primary);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-lg);
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06),
			0 10px 15px -3px rgba(0, 0, 0, 0.1);
		overflow: hidden;
		animation: avatar-tooltip-enter-above 0.15s ease-out;
	}

	/* Animation for below positioning */
	.avatar-hover-tooltip.below {
		animation: avatar-tooltip-enter-below 0.15s ease-out;
	}

	@keyframes avatar-tooltip-enter-above {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes avatar-tooltip-enter-below {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.hover-image-container {
		width: 100%;
		overflow: hidden;
		background: var(--surface-secondary);
	}

	.hover-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.hover-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-secondary);
	}

	.hover-initials {
		font-size: 2.5rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
	}

	.hover-label {
		padding: var(--spacing-2) var(--spacing-3);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-top: 1px solid var(--border-muted);
		background: var(--surface-primary);
	}
</style>
