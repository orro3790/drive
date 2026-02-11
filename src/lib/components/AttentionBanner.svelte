<!--
	AttentionBanner

	Horizontal row of clickable stat cards showing route attention items.
	Clicking a card filters the routes table. Date-adaptive visibility:
	- Past dates: only Completed shown
	- Today: all categories shown
	- Future dates: only Unconfirmed and Unfilled shown
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { RouteWithWarehouse } from '$lib/stores/routeStore.svelte';

	type AttentionItem = {
		key: string;
		label: string;
		count: number;
		color: 'error' | 'warning' | 'info' | 'success';
	};

	let {
		routes,
		date,
		activeFilter,
		onSelect
	}: {
		routes: RouteWithWarehouse[];
		date: string;
		activeFilter: string | null;
		onSelect: (key: string | null) => void;
	} = $props();

	function toTorontoYmd(d = new Date()) {
		return d.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
	}

	const dateRelation = $derived.by(() => {
		const today = toTorontoYmd();
		if (date < today) return 'past';
		if (date === today) return 'today';
		return 'future';
	});

	const items = $derived.by(() => {
		const notArrived = routes.filter((r) => r.shiftProgress === 'no_show').length;
		const unconfirmed = routes.filter((r) => r.shiftProgress === 'unconfirmed').length;
		const unfilled = routes.filter(
			(r) => r.status === 'unfilled' || r.status === 'bidding'
		).length;
		const inProgress = routes.filter(
			(r) => r.shiftProgress === 'arrived' || r.shiftProgress === 'started'
		).length;
		const completed = routes.filter((r) => r.shiftProgress === 'completed').length;

		const all: AttentionItem[] = [
			{ key: 'not_arrived', label: m.manager_attention_not_arrived(), count: notArrived, color: 'error' },
			{ key: 'unconfirmed', label: m.manager_attention_unconfirmed(), count: unconfirmed, color: 'warning' },
			{ key: 'unfilled', label: m.manager_attention_unfilled(), count: unfilled, color: 'warning' },
			{ key: 'in_progress', label: m.manager_attention_in_progress(), count: inProgress, color: 'info' },
			{ key: 'completed', label: m.manager_attention_completed(), count: completed, color: 'success' }
		];

		return all.filter((item) => {
			if (item.count === 0) return false;
			if (dateRelation === 'past') return item.key === 'completed';
			if (dateRelation === 'future')
				return item.key === 'unconfirmed' || item.key === 'unfilled';
			return true;
		});
	});

	function handleClick(key: string) {
		onSelect(activeFilter === key ? null : key);
	}
</script>

{#if items.length > 0}
	<div class="attention-banner" role="toolbar" aria-label="Route attention filters">
		{#each items as item (item.key)}
			<button
				type="button"
				class="attention-card"
				class:active={activeFilter === item.key}
				data-color={item.color}
				onclick={() => handleClick(item.key)}
			>
				<span class="attention-count">{item.count}</span>
				<span class="attention-label">{item.label}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	.attention-banner {
		display: flex;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		overflow-x: auto;
		flex-shrink: 0;
	}

	.attention-card {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		border: var(--border-width-thin) solid var(--border-primary);
		border-radius: var(--radius-md);
		background: var(--surface-primary);
		color: var(--text-normal);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.attention-card:hover {
		background: var(--interactive-hover);
	}

	.attention-card.active {
		border-color: transparent;
	}

	.attention-card.active[data-color='error'] {
		background: color-mix(in srgb, var(--status-error) 15%, transparent);
		border-color: var(--status-error);
	}

	.attention-card.active[data-color='warning'] {
		background: color-mix(in srgb, var(--status-warning) 15%, transparent);
		border-color: var(--status-warning);
	}

	.attention-card.active[data-color='info'] {
		background: color-mix(in srgb, var(--status-info) 15%, transparent);
		border-color: var(--status-info);
	}

	.attention-card.active[data-color='success'] {
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		border-color: var(--status-success);
	}

	.attention-count {
		font-weight: var(--font-weight-semibold);
		font-size: var(--font-size-base);
	}

	[data-color='error'] .attention-count {
		color: var(--status-error);
	}

	[data-color='warning'] .attention-count {
		color: var(--status-warning);
	}

	[data-color='info'] .attention-count {
		color: var(--status-info);
	}

	[data-color='success'] .attention-count {
		color: var(--status-success);
	}

	.attention-label {
		color: var(--text-muted);
	}
</style>
