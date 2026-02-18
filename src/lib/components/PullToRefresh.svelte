<!--
@component
PullToRefresh

Wraps content with pull-to-refresh functionality for mobile.
Shows a spinner when pulled down past threshold, triggers onRefresh callback.

Usage:
```svelte
<PullToRefresh onRefresh={async () => await store.load()}>
  <div>Your content here</div>
</PullToRefresh>
```
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';

	let { onRefresh, children } = $props<{
		onRefresh: () => Promise<void>;
		children: import('svelte').Snippet;
	}>();

	const THRESHOLD = 80; // px to pull before triggering refresh
	const MAX_PULL = 120; // max pull distance

	let containerEl = $state<HTMLElement | null>(null);
	let scrollRoot = $state<HTMLElement | null>(null);
	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	let startY = $state(0);
	let isPulling = $state(false);

	const showIndicator = $derived(pullDistance > 20 || isRefreshing);
	const indicatorProgress = $derived(Math.min(pullDistance / THRESHOLD, 1));
	const shouldTrigger = $derived(pullDistance >= THRESHOLD);

	onMount(() => {
		// Find the scroll root (parent with data-scroll-root or overflow-y: auto)
		scrollRoot = containerEl?.closest('[data-scroll-root]') as HTMLElement | null;

		// Register touch event listeners with { passive: false } to allow preventDefault
		if (!containerEl) return;

		containerEl.addEventListener('touchstart', handleTouchStart, { passive: true });
		containerEl.addEventListener('touchmove', handleTouchMove, { passive: false });
		containerEl.addEventListener('touchend', handleTouchEnd, { passive: true });
		containerEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });

		return () => {
			containerEl?.removeEventListener('touchstart', handleTouchStart);
			containerEl?.removeEventListener('touchmove', handleTouchMove);
			containerEl?.removeEventListener('touchend', handleTouchEnd);
			containerEl?.removeEventListener('touchcancel', handleTouchEnd);
		};
	});

	function handleTouchStart(e: TouchEvent) {
		// Only enable pull-to-refresh when scrolled to top
		const scrollTop = scrollRoot?.scrollTop ?? 0;
		if (scrollTop > 5 || isRefreshing) return;

		startY = e.touches[0].clientY;
		isPulling = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isPulling || isRefreshing) return;

		const currentY = e.touches[0].clientY;
		const diff = currentY - startY;

		if (diff > 0) {
			// Apply resistance as user pulls further
			pullDistance = Math.min(diff * 0.5, MAX_PULL);
			// Prevent scroll while pulling - must use non-passive listener
			if (pullDistance > 10) {
				e.preventDefault();
			}
		} else {
			// User is scrolling up, cancel pull
			isPulling = false;
			pullDistance = 0;
		}
	}

	async function handleTouchEnd() {
		if (!isPulling) return;
		isPulling = false;

		if (shouldTrigger && !isRefreshing) {
			isRefreshing = true;
			pullDistance = THRESHOLD; // Hold at threshold while refreshing

			try {
				await onRefresh();
			} finally {
				isRefreshing = false;
				pullDistance = 0;
			}
		} else {
			pullDistance = 0;
		}
	}
</script>

<div class="pull-to-refresh-container" bind:this={containerEl}>
	<div
		class="pull-indicator"
		class:visible={showIndicator}
		style="--pull-distance: {pullDistance}px; --progress: {indicatorProgress};"
	>
		{#if isRefreshing}
			<Spinner size={20} />
		{:else}
			<svg
				class="pull-arrow"
				class:triggered={shouldTrigger}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M12 5v14M5 12l7-7 7 7" />
			</svg>
		{/if}
	</div>

	<div class="pull-content" style="--pull-offset: {pullDistance}px;">
		{@render children()}
	</div>
</div>

<style>
	.pull-to-refresh-container {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		/* No overflow here — let the scroll-root parent handle scrolling */
	}

	.pull-indicator {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		height: calc(var(--pull-distance, 0px));
		overflow: hidden;
		opacity: 0;
		transition: opacity 150ms ease;
		color: var(--text-muted);
	}

	.pull-indicator.visible {
		opacity: var(--progress, 0);
	}

	.pull-arrow {
		width: 24px;
		height: 24px;
		transform: rotate(180deg);
		transition: transform 200ms ease;
	}

	.pull-arrow.triggered {
		transform: rotate(0deg);
	}

	.pull-content {
		transform: translateY(var(--pull-offset, 0px));
		transition: transform 200ms ease;
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	/* Disable transition while actively pulling */
	.pull-to-refresh-container:active .pull-content {
		transition: none;
	}
</style>
