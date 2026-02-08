<!--
	Driver Health Card

	Displays driver health score (0-100), star progression (0-4),
	factor breakdown, buff progress, and hard-stop warnings.
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
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { HealthResponse } from '$lib/schemas/health';

	let health = $state<HealthResponse | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	const scoreColor = $derived.by(() => {
		if (!health) return 'var(--text-muted)';
		if (health.hardStop.triggered) return 'var(--status-error)';
		const score = health.score ?? 0;
		if (score >= health.eliteThreshold) return 'var(--status-success)';
		if (score >= 50) return 'var(--status-warning)';
		return 'var(--status-error)';
	});

	const scorePercent = $derived(
		health?.score !== null && health?.score !== undefined ? Math.min(health.score, 100) : 0
	);

	const elitePercent = $derived(health?.eliteThreshold ?? 80);
	const isPastThreshold = $derived(scorePercent >= elitePercent);
	const isBuffActive = $derived(isPastThreshold && !!health?.simulation.bonusEligible);
	const isCharging = $derived(isPastThreshold && !isBuffActive);

	const buffTooltipText = $derived(
		health
			? m.dashboard_health_buff_tooltip({
					percent: String(health.simulation.bonusPercent),
					threshold: String(health.eliteThreshold)
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
				<span class="score-value" style:color={scoreColor}>
					<HealthLine stroke={scoreColor} />
					{health.score ?? 0}
				</span>
			</div>
			<div
				class="score-bar-track"
				role="progressbar"
				aria-valuenow={scorePercent}
				aria-valuemin={0}
				aria-valuemax={100}
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
					<div class="elite-marker" style:left="{elitePercent}%">
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

		<!-- Factor breakdown -->
		{#if health.recentScores.length > 0}
			{@const latest = health.recentScores[0]}
			<div class="factors">
				<div class="factor-row">
					<span class="factor-label">{m.dashboard_health_factor_attendance()}</span>
					<span class="factor-value">{Math.round(latest.attendanceRate * 100)}%</span>
				</div>
				<div class="factor-row">
					<span class="factor-label">{m.dashboard_health_factor_completion()}</span>
					<span class="factor-value">{Math.round(latest.completionRate * 100)}%</span>
				</div>
			</div>
		{/if}
	{/if}
</section>

<style>
	.health-card {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-4);
		box-shadow: var(--shadow-base);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-3);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.health-loading {
		display: flex;
		justify-content: center;
		padding: var(--spacing-4);
	}

	.health-error {
		font-size: var(--font-size-sm);
		color: var(--status-error);
		text-align: center;
		padding: var(--spacing-3);
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
		margin-top: var(--spacing-3);
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

	/* Charging animation — gentle pulse on the bar fill */
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

	/* Factor breakdown */
	.factors {
		margin-top: var(--spacing-3);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: var(--spacing-3);
		background: var(--surface-secondary);
		border-radius: var(--radius-base);
	}

	.factor-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.factor-label {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.factor-value {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	/* Responsive */
	@media (max-width: 767px) {
		.health-card {
			padding: var(--spacing-3);
		}
	}
</style>
