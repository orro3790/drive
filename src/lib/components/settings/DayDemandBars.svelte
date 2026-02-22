<!--
@component
DayDemandBars - Mini bar chart showing per-day driver demand above day toggles.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		dayCounts: Record<string, number>;
		dayLabels: string[];
		selectedDays: number[];
		capReached: boolean;
	}

	let { dayCounts, dayLabels, selectedDays, capReached }: Props = $props();

	const maxCount = $derived(Math.max(1, ...Object.values(dayCounts)));

	function barHeight(day: number): number {
		const count = dayCounts[String(day)] ?? 0;
		if (count === 0) return 4;
		return Math.max(4, (count / maxCount) * 100);
	}

	function countFor(day: number): number {
		return dayCounts[String(day)] ?? 0;
	}

	function isSelected(day: number): boolean {
		return selectedDays.includes(day);
	}

	function isDimmed(day: number): boolean {
		return capReached && !isSelected(day);
	}
</script>

<div class="demand-bars" role="img" aria-label={m.preferences_demand_label()}>
	{#each dayLabels as label, day (day)}
		{@const count = countFor(day)}
		<div class="bar-cell" class:bar-cell-dimmed={isDimmed(day)}>
			<span class="bar-count" class:bar-count-selected={isSelected(day)}>{count}</span>
			<div
				class="bar"
				class:bar-selected={isSelected(day)}
				style:height="{barHeight(day)}%"
				aria-label={m.preferences_demand_count({ count: String(count), day: label })}
			></div>
		</div>
	{/each}
</div>

<style>
	.demand-bars {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: var(--spacing-2);
		align-items: end;
		height: 72px;
		padding-bottom: var(--spacing-2);
	}

	.bar-cell {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		height: 100%;
		justify-content: flex-end;
		transition: opacity 0.25s ease;
	}

	.bar-cell-dimmed {
		opacity: 0.4;
	}

	.bar-count {
		font-size: var(--font-size-xs);
		line-height: 1;
		color: var(--text-muted);
		transition: color 0.25s ease;
	}

	.bar-count-selected {
		color: var(--status-success);
	}

	.bar {
		width: 100%;
		max-width: 32px;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		background-color: color-mix(in srgb, var(--text-muted) 25%, transparent);
		transition:
			height 0.25s ease,
			background-color 0.25s ease;
	}

	.bar-selected {
		background-color: color-mix(in srgb, var(--status-success) 30%, transparent);
	}

	@media (max-width: 767px) {
		.demand-bars {
			gap: var(--spacing-1);
		}
	}
</style>
