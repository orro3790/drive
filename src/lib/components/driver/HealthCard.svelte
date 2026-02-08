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
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import Tooltip from '$lib/components/primitives/Tooltip.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import StarEmpty from '$lib/components/icons/StarEmpty.svelte';
	import StarFilled from '$lib/components/icons/StarFilled.svelte';
	import Dollar from '$lib/components/icons/Dollar.svelte';
	import Lightning from '$lib/components/icons/Lightning.svelte';
	import HealthLine from '$lib/components/icons/HealthLine.svelte';
	import ChevronDown from '$lib/components/icons/ChevronDown.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { HealthResponse } from '$lib/schemas/health';

	let health = $state<HealthResponse | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);
	let showContributions = $state(false);

	const scoreColor = $derived.by(() => {
		if (!health) return 'var(--text-muted)';
		if (health.hardStop.triggered) return 'var(--status-error)';
		const score = health.score ?? 0;
		if (score >= health.tierThreshold) return 'var(--status-success)';
		if (score >= health.tierThreshold / 2) return 'var(--status-warning)';
		return 'var(--status-error)';
	});

	// Bar scale: threshold sits at 80%, leaving 20% buffer zone beyond it
	const thresholdPosition = 80;
	const barMax = $derived(health ? health.tierThreshold / (thresholdPosition / 100) : 1);
	const scorePercent = $derived(
		health?.score !== null && health?.score !== undefined
			? Math.min((health.score / barMax) * 100, 100)
			: 0
	);

	const isPastThreshold = $derived(
		health?.score !== null && health?.score !== undefined && health.score >= health.tierThreshold
	);
	const isBuffActive = $derived(isPastThreshold && !!health?.simulation.bonusEligible);
	const isCharging = $derived(isPastThreshold && !isBuffActive);

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
			{ label: m.dashboard_health_contribution_confirmed(), count: c.confirmedOnTime.count, perPoint: c.confirmedOnTime.count > 0 ? c.confirmedOnTime.points / c.confirmedOnTime.count : 1, total: c.confirmedOnTime.points },
			{ label: m.dashboard_health_contribution_arrived(), count: c.arrivedOnTime.count, perPoint: c.arrivedOnTime.count > 0 ? c.arrivedOnTime.points / c.arrivedOnTime.count : 2, total: c.arrivedOnTime.points },
			{ label: m.dashboard_health_contribution_completed(), count: c.completedShifts.count, perPoint: c.completedShifts.count > 0 ? c.completedShifts.points / c.completedShifts.count : 2, total: c.completedShifts.points },
			{ label: m.dashboard_health_contribution_high_delivery(), count: c.highDelivery.count, perPoint: c.highDelivery.count > 0 ? c.highDelivery.points / c.highDelivery.count : 1, total: c.highDelivery.points },
			{ label: m.dashboard_health_contribution_bid_pickup(), count: c.bidPickups.count, perPoint: c.bidPickups.count > 0 ? c.bidPickups.points / c.bidPickups.count : 2, total: c.bidPickups.points },
			{ label: m.dashboard_health_contribution_urgent_pickup(), count: c.urgentPickups.count, perPoint: c.urgentPickups.count > 0 ? c.urgentPickups.points / c.urgentPickups.count : 4, total: c.urgentPickups.points },
			{ label: m.dashboard_health_contribution_auto_drop(), count: c.autoDrops.count, perPoint: c.autoDrops.count > 0 ? c.autoDrops.points / c.autoDrops.count : -12, total: c.autoDrops.points },
			{ label: m.dashboard_health_contribution_late_cancel(), count: c.lateCancellations.count, perPoint: c.lateCancellations.count > 0 ? c.lateCancellations.points / c.lateCancellations.count : -48, total: c.lateCancellations.points }
		];
		return rows.filter((r) => r.count > 0);
	});

	const contributionsTotal = $derived(
		contributionRows.reduce((sum, r) => sum + r.total, 0)
	);

	async function loadHealth() {
		isLoading = true;
		hasError = false;

		try {
			const res = await fetch('/api/driver-health');
			if (!res.ok) throw new Error('Failed to load health data');
			health = await res.json();
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

<section class="health-card" aria-label={m.dashboard_health_section()}>
	<div class="section-header">
		<h2>{m.dashboard_health_section()}</h2>
	</div>

	{#if isLoading}
		<div class="health-loading">
			<Spinner size={20} label={m.dashboard_health_loading()} />
		</div>
	{:else if hasError || !health}
		<p class="health-error">{m.dashboard_health_load_error()}</p>
	{:else}
		<!-- Hard-stop warning -->
		{#if health.hardStop.triggered}
			<NoticeBanner variant="warning" align="start">
				<p class="hard-stop-title">{m.dashboard_health_hard_stop_title()}</p>
				<p class="hard-stop-message">{m.dashboard_health_hard_stop_message()}</p>
			</NoticeBanner>
		{/if}

		<!-- Score bar -->
		<div class="score-section">
			<div class="score-header">
				<div class="score-stars">
					<div class="stars-row" aria-label="{health.stars} of {health.maxStars} stars">
						{#each Array(health.maxStars) as _, i (i)}
							<span class="star" aria-hidden="true">
								{#if i < health.stars}
									<StarFilled fill="var(--status-warning)" />
								{:else}
									<StarEmpty stroke="var(--border-primary)" />
								{/if}
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
					<span class="tier-label">{m.dashboard_health_tier_label({ tier: health.tier })}</span>
					<span class="score-value" style:color={scoreColor}>
						<HealthLine stroke={scoreColor} />
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
					class:charging={isCharging}
					style:width="{scorePercent}%"
					style:background={scoreColor}
				>
					{#if isPastThreshold}
						<span class="bar-tip-icon" class:tip-charging={isCharging}>
							<Lightning stroke={isBuffActive ? 'var(--status-success)' : 'var(--text-muted)'} />
						</span>
					{/if}
				</div>
				<Tooltip tooltip={true} position="bottom" delay={300} focusable={false}>
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
					<div class="elite-marker" style:left="{thresholdPosition}%">
						<Dollar stroke="var(--text-muted)" />
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
									{row.count} × <span class="per-point" class:per-point-positive={row.perPoint > 0} class:per-point-negative={row.perPoint < 0}>({row.perPoint > 0 ? '+' : ''}{row.perPoint})</span>
								</span>
								<span class="contribution-total" class:negative-text={row.total < 0}>
									{row.total > 0 ? '+' : ''}{row.total}
								</span>
							</div>
						{/each}
						<div class="contribution-row contribution-net">
							<span class="contribution-label">{m.dashboard_health_contributions_total()}</span>
							<span class="contribution-total" class:negative-text={contributionsTotal < 0}>
								{contributionsTotal > 0 ? '+' : ''}{contributionsTotal}
							</span>
						</div>
					</div>
				{/if}
			</div>
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

	.health-loading {
		display: flex;
		justify-content: center;
		padding: var(--spacing-3);
	}

	.health-error {
		font-size: var(--font-size-sm);
		color: var(--status-error);
		text-align: center;
		padding: var(--spacing-2) var(--spacing-3);
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
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
	}

	.score-value {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
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
		transition: width 0.4s var(--transition-ease);
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

	/* Lightning bolt at bar tip */
	.bar-tip-icon {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translate(50%, -50%);
		display: flex;
	}

	.bar-tip-icon :global(svg) {
		width: 20px;
		height: 20px;
	}

	.bar-tip-icon.tip-charging {
		animation: chargePulse 2s ease-in-out infinite;
	}

	/* Dollar marker */
	.elite-marker {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		align-items: center;
		cursor: default;
	}

	.elite-marker :global(svg) {
		width: 24px;
		height: 24px;
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
		display: flex;
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

	.per-point-positive {
		color: var(--status-success);
	}

	.per-point-negative {
		color: var(--status-error);
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
