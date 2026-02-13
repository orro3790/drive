<!--
	Driver Health Card

	Displays driver health score (additive points toward 96 threshold),
	star progression (0-4), expandable contributions breakdown with
	count × point value, buff progress, and hard-stop warnings.
	Fetches from /api/driver-health on mount.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import Tooltip from '$lib/components/primitives/Tooltip.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import StarEmpty from '$lib/components/icons/StarEmpty.svelte';
	import StarFilled from '$lib/components/icons/StarFilled.svelte';
	import Dollar from '$lib/components/icons/Dollar.svelte';
	import HealthLine from '$lib/components/icons/HealthLine.svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { HealthResponse } from '$lib/schemas/health';
	import {
		deriveHealthCardState,
		deriveHealthScoreColor,
		deriveThresholdFlags
	} from '$lib/components/driver/healthCardState';

	let { healthUrl = '/api/driver-health' }: { healthUrl?: string } = $props();

	let health = $state<HealthResponse | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);
	let showContributions = $state(false);
	let animateHealthIn = $state(false);

	const scoreColor = $derived.by(() => deriveHealthScoreColor(health));
	const healthState = $derived.by(() => deriveHealthCardState(health));

	// Bar scale: threshold sits at 80%, leaving 20% buffer zone beyond it
	const thresholdPosition = 80;
	const barMax = $derived(health ? health.tierThreshold / (thresholdPosition / 100) : 1);
	const scorePercent = $derived(
		health?.score !== null && health?.score !== undefined
			? Math.min((health.score / barMax) * 100, 100)
			: 0
	);
	const displayStars = $derived((health ? health.stars : 0) * (animateHealthIn ? 1 : 0));

	const isPastThreshold = $derived.by(() => deriveThresholdFlags(health).isPastThreshold);
	const isBuffActive = $derived.by(() => deriveThresholdFlags(health).isBuffActive);
	const isCharging = $derived.by(() => deriveThresholdFlags(health).isCharging);
	const isThresholdEnergized = $derived(isPastThreshold && animateHealthIn);

	const buffTooltipText = $derived(
		health
			? m.dashboard_health_buff_tooltip({
					percent: String(health.simulation.bonusPercent),
					threshold: String(health.tierThreshold)
				})
			: ''
	);
	const chargingText = $derived(
		health
			? m.dashboard_health_buff_charging({
					current: String(health.stars),
					total: String(health.maxStars)
				})
			: ''
	);

	type ContributionRow = {
		label: string;
		count: number;
		perPoint: number;
		total: number;
	};

	const contributionRows = $derived.by((): ContributionRow[] => {
		if (!health?.contributions) return [];
		const c = health.contributions;
		const rows: ContributionRow[] = [
			{
				label: m.dashboard_health_contribution_confirmed(),
				count: c.confirmedOnTime.count,
				perPoint:
					c.confirmedOnTime.count > 0 ? c.confirmedOnTime.points / c.confirmedOnTime.count : 1,
				total: c.confirmedOnTime.points
			},
			{
				label: m.dashboard_health_contribution_arrived(),
				count: c.arrivedOnTime.count,
				perPoint: c.arrivedOnTime.count > 0 ? c.arrivedOnTime.points / c.arrivedOnTime.count : 2,
				total: c.arrivedOnTime.points
			},
			{
				label: m.dashboard_health_contribution_completed(),
				count: c.completedShifts.count,
				perPoint:
					c.completedShifts.count > 0 ? c.completedShifts.points / c.completedShifts.count : 2,
				total: c.completedShifts.points
			},
			{
				label: m.dashboard_health_contribution_high_delivery(),
				count: c.highDelivery.count,
				perPoint: c.highDelivery.count > 0 ? c.highDelivery.points / c.highDelivery.count : 1,
				total: c.highDelivery.points
			},
			{
				label: m.dashboard_health_contribution_bid_pickup(),
				count: c.bidPickups.count,
				perPoint: c.bidPickups.count > 0 ? c.bidPickups.points / c.bidPickups.count : 2,
				total: c.bidPickups.points
			},
			{
				label: m.dashboard_health_contribution_urgent_pickup(),
				count: c.urgentPickups.count,
				perPoint: c.urgentPickups.count > 0 ? c.urgentPickups.points / c.urgentPickups.count : 4,
				total: c.urgentPickups.points
			},
			{
				label: m.dashboard_health_contribution_auto_drop(),
				count: c.autoDrops.count,
				perPoint: c.autoDrops.count > 0 ? c.autoDrops.points / c.autoDrops.count : -12,
				total: c.autoDrops.points
			},
			{
				label: m.dashboard_health_contribution_early_cancel(),
				count: c.earlyCancellations.count,
				perPoint:
					c.earlyCancellations.count > 0
						? c.earlyCancellations.points / c.earlyCancellations.count
						: -8,
				total: c.earlyCancellations.points
			},
			{
				label: m.dashboard_health_contribution_late_cancel(),
				count: c.lateCancellations.count,
				perPoint:
					c.lateCancellations.count > 0
						? c.lateCancellations.points / c.lateCancellations.count
						: -32,
				total: c.lateCancellations.points
			}
		];
		return rows.filter((r) => r.count > 0);
	});

	const contributionsTotal = $derived(contributionRows.reduce((sum, r) => sum + r.total, 0));

	function triggerHealthEnterAnimation() {
		animateHealthIn = false;
		requestAnimationFrame(() => {
			animateHealthIn = true;
		});
	}

	async function loadHealth() {
		isLoading = true;
		hasError = false;
		animateHealthIn = false;

		try {
			const res = await fetch(healthUrl);
			if (!res.ok) throw new Error('Failed to load health data');
			health = await res.json();
			triggerHealthEnterAnimation();
		} catch {
			hasError = true;
			toastStore.error(m.dashboard_health_load_error());
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadHealth();
	});
</script>

<section
	class="health-card"
	data-health-state={healthState}
	aria-label={m.dashboard_health_section()}
>
	<div class="section-header">
		<h2>{m.dashboard_health_section()}</h2>
	</div>

	{#if isLoading}
		<div class="score-section score-section-loading" aria-busy="true" aria-live="polite">
			<div class="score-header">
				<div class="score-stars">
					<div class="stars-row" aria-hidden="true">
						{#each Array(4) as _, i (i)}
							<span class="star star-loading">
								<StarEmpty stroke="var(--border-primary)" />
							</span>
						{/each}
					</div>
				</div>
				<div class="score-label-group">
					<span class="tier-label skeleton-block skeleton-tier" aria-hidden="true"></span>
					<span class="score-value skeleton-value" aria-hidden="true">
						<HealthLine stroke="var(--text-faint)" />
						<span class="skeleton-block skeleton-score"></span>
					</span>
				</div>
			</div>
			<div class="score-bar-track" aria-hidden="true">
				<div class="score-bar-fill score-bar-fill-loading" style:width="36%"></div>
				<div class="elite-marker elite-marker-loading" style:left="{thresholdPosition}%">
					<Dollar stroke="var(--text-normal)" />
				</div>
			</div>
			<span class="sr-only">{m.dashboard_health_loading()}</span>
		</div>
	{:else if hasError || !health}
		<p class="health-error">{m.dashboard_health_load_error()}</p>
	{:else}
		<!-- Score bar -->
		<div class="score-section">
			<div class="score-header">
				<div class="score-stars">
					<div class="stars-row" aria-label="{health.stars} of {health.maxStars} stars">
						{#each Array(health.maxStars) as _, i (i)}
							<span class="star star-slot" class:is-filled={i < displayStars} aria-hidden="true">
								<span class="star-empty"><StarEmpty stroke="currentColor" /></span>
								<span class="star-filled"><StarFilled fill="currentColor" /></span>
							</span>
						{/each}
					</div>
					{#if health.streakWeeks > 0}
						<span class="streak-badge"
							>{m.dashboard_health_streak_label({ count: health.streakWeeks })}</span
						>
					{/if}
				</div>
				<div class="score-label-group">
					<span
						class="tier-label"
						style:color={animateHealthIn ? 'var(--text-muted)' : 'var(--text-faint)'}
					>
						{m.dashboard_health_tier_label({ tier: health.tier })}
					</span>
					<span
						class="score-value"
						style:color={animateHealthIn ? scoreColor : 'var(--text-faint)'}
					>
						<HealthLine stroke="currentColor" />
						{health.score ?? 0}
					</span>
				</div>
			</div>
			<div
				class="score-bar-track"
				role="progressbar"
				aria-valuenow={health.score ?? 0}
				aria-valuemin={0}
				aria-valuemax={health.tierThreshold}
				aria-label={m.dashboard_health_section()}
			>
				<div
					class="score-bar-fill"
					class:charging={isCharging && animateHealthIn}
					style:width="{animateHealthIn ? scorePercent : 0}%"
					style:background={animateHealthIn ? scoreColor : 'var(--interactive-hover)'}
				></div>
				<Tooltip tooltip={true} position="bottom" delay={300} focusable={false} touchable>
					{#snippet content()}
						<div class="buff-tooltip">
							<p>{buffTooltipText}</p>
							{#if isBuffActive}
								<p class="buff-tooltip-status buff-active">{m.dashboard_health_buff_active()}</p>
							{:else}
								<p class="buff-tooltip-status">{chargingText}</p>
							{/if}
						</div>
					{/snippet}
					<div
						class="elite-marker"
						class:elite-marker-active={isThresholdEnergized}
						class:elite-marker-charging={isThresholdEnergized && isCharging}
						style:left="{thresholdPosition}%"
					>
						<Dollar
							stroke={isThresholdEnergized ? 'var(--text-on-accent)' : 'var(--text-normal)'}
						/>
					</div>
				</Tooltip>
			</div>

			<!-- Charging progress below bar -->
			{#if isCharging}
				<div class="charging-progress">
					<span class="charging-label">
						{chargingText}
					</span>
				</div>
			{:else if isBuffActive}
				<div class="charging-progress">
					<span class="charging-label buff-active-label">
						{m.dashboard_health_buff_active()}
					</span>
				</div>
			{/if}
		</div>

		<!-- Expandable contributions breakdown -->
		{#if health.contributions && contributionRows.length > 0}
			<div class="contributions-section">
				<button
					class="contributions-toggle"
					onclick={() => (showContributions = !showContributions)}
					aria-expanded={showContributions}
				>
					<span>{m.dashboard_health_contributions_label()}</span>
					<span class="chevron" class:chevron-open={showContributions}>
						<ChevronDown />
					</span>
				</button>

				{#if showContributions}
					<div class="contributions-list">
						{#each contributionRows as row (row.label)}
							<div class="contribution-row" class:negative={row.total < 0}>
								<span class="contribution-label">{row.label}</span>
								<span class="contribution-calc">
									{row.count} × ({row.perPoint > 0 ? '+' : ''}{row.perPoint})
								</span>
								<span
									class="contribution-total"
									class:positive-text={row.total > 0}
									class:negative-text={row.total < 0}
								>
									{row.total > 0 ? '+' : ''}{row.total}
								</span>
							</div>
						{/each}
						<div class="contribution-row contribution-net">
							<span class="contribution-label">{m.dashboard_health_contributions_total()}</span>
							<span
								class="contribution-total"
								class:positive-text={contributionsTotal > 0}
								class:negative-text={contributionsTotal < 0}
							>
								{contributionsTotal > 0 ? '+' : ''}{contributionsTotal}
							</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		{#if health.hardStop.triggered}
			<NoticeBanner variant="warning" align="start">
				<p class="hard-stop-title">{m.dashboard_health_hard_stop_title()}</p>
				<p class="hard-stop-message">{m.dashboard_health_hard_stop_message()}</p>
			</NoticeBanner>
		{/if}
	{/if}
</section>

<style>
	.health-card {
		display: flex;
		flex-direction: column;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 var(--spacing-3);
		margin-bottom: var(--spacing-2);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
	}

	.health-error {
		font-size: var(--font-size-sm);
		color: var(--status-error);
		text-align: center;
		padding: var(--spacing-2) var(--spacing-3);
	}

	.score-section-loading {
		padding-top: var(--spacing-1);
	}

	.skeleton-block {
		display: inline-flex;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--interactive-hover) 65%, transparent);
		animation: healthSkeletonPulse 1.4s ease-in-out infinite;
	}

	.skeleton-tier {
		width: 64px;
		height: 1.2em;
	}

	.skeleton-value {
		color: var(--text-faint);
	}

	.skeleton-score {
		width: 42px;
		height: 1.2em;
	}

	.score-bar-fill-loading {
		background: color-mix(in srgb, var(--interactive-hover) 75%, transparent);
		animation: healthSkeletonPulse 1.4s ease-in-out infinite;
	}

	.star-loading {
		opacity: 0.75;
	}

	@keyframes healthSkeletonPulse {
		0%,
		100% {
			opacity: 0.55;
		}
		50% {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.skeleton-block,
		.score-bar-fill-loading {
			animation: none;
		}

		.tier-label,
		.score-value,
		.score-bar-fill,
		.star-slot,
		.star-slot .star-empty,
		.star-slot .star-filled {
			transition: none;
		}
	}

	/* Hard-stop */
	.hard-stop-title {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}

	.hard-stop-message {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
	}

	:global(.health-card .notice-banner) {
		margin: var(--spacing-4) var(--spacing-3) 0;
	}

	/* Score section */
	.score-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: 0 var(--spacing-3);
	}

	.score-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.score-stars {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
	}

	.score-label-group {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}

	.tier-label {
		display: inline-flex;
		align-items: center;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
		line-height: 1.2;
		min-height: 1.2em;
		transition: color 360ms var(--transition-ease);
	}

	.score-value {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
		line-height: 1.2;
		min-height: 1.2em;
		transition: color 360ms var(--transition-ease);
	}

	.score-value :global(svg) {
		width: 20px;
		height: 20px;
	}

	.score-bar-track {
		position: relative;
		height: 8px;
		background: var(--interactive-normal);
		border-radius: var(--radius-full);
		overflow: visible;
	}

	.score-bar-fill {
		position: relative;
		height: 100%;
		border-radius: var(--radius-full);
		transition:
			width 0.45s var(--transition-ease),
			background-color 0.45s var(--transition-ease);
	}

	/* Charging animation */
	.score-bar-fill.charging {
		animation: chargePulse 2s ease-in-out infinite;
	}

	@keyframes chargePulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	/* Dollar threshold marker */
	.elite-marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: var(--radius-full);
		background: var(--interactive-normal);
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--surface-primary) 80%, transparent),
			0 1px 3px rgba(0, 0, 0, 0.24);
		cursor: default;
	}

	.elite-marker.elite-marker-active {
		background: var(--status-success);
	}

	.elite-marker.elite-marker-loading {
		background: color-mix(in srgb, var(--interactive-hover) 78%, transparent);
	}

	.elite-marker.elite-marker-charging {
		animation: chargePulse 2s ease-in-out infinite;
	}

	.elite-marker :global(svg) {
		width: 100%;
		height: 100%;
	}

	/* Buff tooltip */
	.buff-tooltip {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.buff-tooltip p {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.buff-tooltip-status {
		color: var(--text-muted);
	}

	.buff-tooltip-status.buff-active {
		color: var(--status-success);
		font-weight: var(--font-weight-medium);
	}

	/* Charging progress below bar */
	.charging-progress {
		display: flex;
		justify-content: flex-end;
	}

	.charging-label {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.buff-active-label {
		color: var(--status-success);
		font-weight: var(--font-weight-medium);
	}

	/* Stars */
	.streak-badge {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.stars-row {
		display: flex;
		gap: var(--spacing-1);
	}

	.star {
		display: inline-grid;
		place-items: center;
		width: 16px;
		height: 16px;
	}

	.star :global(svg) {
		width: 16px;
		height: 16px;
	}

	.star-slot {
		position: relative;
		color: var(--border-primary);
		transition: color 360ms var(--transition-ease);
	}

	.star-slot .star-empty,
	.star-slot .star-filled {
		position: absolute;
		inset: 0;
		display: inline-grid;
		place-items: center;
	}

	.star-slot .star-empty {
		opacity: 1;
		transition: opacity 300ms var(--transition-ease);
	}

	.star-slot .star-filled {
		opacity: 0;
		transform: scale(0.9);
		transition:
			opacity 300ms var(--transition-ease),
			transform 300ms var(--transition-ease);
	}

	.star-slot.is-filled {
		color: var(--status-warning);
	}

	.star-slot.is-filled .star-empty {
		opacity: 0;
	}

	.star-slot.is-filled .star-filled {
		opacity: 1;
		transform: scale(1);
	}

	/* Contributions section */
	.contributions-section {
		margin-top: var(--spacing-2);
		padding: 0 var(--spacing-3);
	}

	.contributions-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--spacing-2) 0;
		background: none;
		border: none;
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.chevron {
		display: flex;
		transition: transform 0.2s ease;
	}

	.chevron :global(svg) {
		width: 16px;
		height: 16px;
	}

	.chevron-open {
		transform: rotate(180deg);
	}

	.contributions-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		padding-bottom: var(--spacing-2);
	}

	.contribution-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		font-size: var(--font-size-sm);
	}

	.contribution-label {
		flex: 1;
		color: var(--text-muted);
	}

	.contribution-calc {
		color: var(--text-faint);
		font-size: var(--font-size-xs);
		font-family: var(--font-family-mono);
	}

	.contribution-total {
		min-width: 3ch;
		text-align: right;
		font-weight: var(--font-weight-medium);
		font-family: var(--font-family-mono);
		color: var(--text-normal);
	}

	.positive-text {
		color: var(--status-success);
	}

	.negative-text {
		color: var(--status-error);
	}

	.contribution-net {
		border-top: 1px solid var(--border-secondary);
		padding-top: var(--spacing-1);
		margin-top: var(--spacing-1);
	}

	.contribution-net .contribution-label {
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}
</style>
