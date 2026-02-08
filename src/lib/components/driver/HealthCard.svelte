<!--
	Driver Health Card

	Displays driver health score (0-100), star progression (0-4),
	factor breakdown, milestone guidance, simulation preview, and
	hard-stop warnings. Fetches from /api/driver-health on mount.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';

	type HealthData = {
		score: number | null;
		stars: number;
		streakWeeks: number;
		eliteThreshold: number;
		maxStars: number;
		hardStop: {
			triggered: boolean;
			assignmentPoolEligible: boolean;
			requiresManagerIntervention: boolean;
			reasons: string[];
		};
		nextMilestone: {
			targetStars: number;
			currentStars: number;
		};
		simulation: {
			bonusEligible: boolean;
			bonusPercent: number;
			label: string;
		};
		recentScores: {
			date: string;
			score: number;
			attendanceRate: number;
			completionRate: number;
			hardStopTriggered: boolean;
		}[];
		isOnboarding: boolean;
	};

	let health = $state<HealthData | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	const scoreColor = $derived.by(() => {
		if (!health || health.score === null) return 'var(--text-muted)';
		if (health.hardStop.triggered) return 'var(--status-error)';
		if (health.score >= health.eliteThreshold) return 'var(--status-success)';
		if (health.score >= 50) return 'var(--status-warning)';
		return 'var(--status-error)';
	});

	const scorePercent = $derived(
		health?.score !== null && health?.score !== undefined ? health.score : 0
	);

	const elitePercent = $derived(health?.eliteThreshold ?? 80);

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
			<Spinner size={20} label="Loading health data" />
		</div>
	{:else if hasError || !health}
		<p class="health-error">{m.dashboard_health_load_error()}</p>
	{:else if health.isOnboarding}
		<NoticeBanner variant="accent">
			<p class="onboarding-title">{m.dashboard_health_onboarding_title()}</p>
			<p class="onboarding-message">{m.dashboard_health_onboarding_message()}</p>
		</NoticeBanner>
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
				<span class="score-label">{m.dashboard_health_score_label()}</span>
				<span class="score-value" style:color={scoreColor}>
					{health.score ?? '—'}
				</span>
			</div>
			<div class="score-bar-track" role="progressbar" aria-valuenow={scorePercent} aria-valuemin={0} aria-valuemax={100}>
				<div
					class="score-bar-fill"
					style:width="{scorePercent}%"
					style:background={scoreColor}
				></div>
				<div
					class="elite-marker"
					style:left="{elitePercent}%"
					title="{m.dashboard_health_elite_marker()} ({elitePercent})"
				>
					<span class="elite-label">{m.dashboard_health_elite_marker()}</span>
				</div>
			</div>
		</div>

		<!-- Stars -->
		<div class="stars-section">
			<div class="stars-header">
				<span class="stars-label">{m.dashboard_health_stars_label()}</span>
				{#if health.streakWeeks > 0}
					<span class="streak-badge">{m.dashboard_health_streak_label({ count: health.streakWeeks })}</span>
				{/if}
			</div>
			<div class="stars-row" aria-label="{health.stars} of {health.maxStars} stars">
				{#each Array(health.maxStars) as _, i (i)}
					<svg
						class="star"
						class:star-filled={i < health.stars}
						viewBox="0 0 20 20"
						width="24"
						height="24"
						aria-hidden="true"
					>
						<path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.49L10 14.27 5.06 16.7 6 11.21l-4-3.9 5.53-.8z" />
					</svg>
				{/each}
			</div>
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

		<!-- Next milestone -->
		<div class="milestone">
			{#if health.stars < health.maxStars}
				<p class="milestone-text">{m.dashboard_health_milestone_next({ target: String(health.nextMilestone.targetStars) })}</p>
			{:else}
				<p class="milestone-text milestone-reached">{m.dashboard_health_milestone_reached()}</p>
			{/if}
		</div>

		<!-- Simulation preview (4 stars) -->
		{#if health.simulation.bonusEligible}
			<div class="simulation">
				<Chip variant="status" status="success" size="xs" label={m.dashboard_health_simulation_label()} />
				<p class="simulation-text">{m.dashboard_health_simulation_bonus({ percent: String(health.simulation.bonusPercent) })}</p>
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

	/* Onboarding */
	.onboarding-title {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}

	.onboarding-message {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
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
		align-items: baseline;
	}

	.score-label {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.score-value {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
	}

	.score-bar-track {
		position: relative;
		height: 8px;
		background: var(--interactive-normal);
		border-radius: var(--radius-full);
		overflow: visible;
	}

	.score-bar-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width 0.4s var(--transition-ease);
	}

	.elite-marker {
		position: absolute;
		top: -2px;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.elite-marker::before {
		content: '';
		width: 2px;
		height: 12px;
		background: var(--text-muted);
		border-radius: var(--radius-full);
	}

	.elite-label {
		font-size: 10px;
		color: var(--text-muted);
		white-space: nowrap;
		margin-top: 2px;
	}

	/* Stars */
	.stars-section {
		margin-top: var(--spacing-4);
	}

	.stars-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-2);
	}

	.stars-label {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.streak-badge {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.stars-row {
		display: flex;
		gap: var(--spacing-1);
	}

	.star {
		fill: var(--interactive-normal);
		stroke: var(--border-primary);
		stroke-width: 1;
		transition: fill 0.2s var(--transition-ease);
	}

	.star-filled {
		fill: var(--status-warning);
		stroke: var(--status-warning);
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

	/* Milestone */
	.milestone {
		margin-top: var(--spacing-3);
	}

	.milestone-text {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		text-align: center;
	}

	.milestone-reached {
		color: var(--status-success);
	}

	/* Simulation */
	.simulation {
		margin-top: var(--spacing-3);
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		background: color-mix(in srgb, var(--status-success) 8%, transparent);
		border-radius: var(--radius-base);
	}

	.simulation-text {
		font-size: var(--font-size-sm);
		color: var(--text-normal);
	}

	/* Responsive */
	@media (max-width: 767px) {
		.health-card {
			padding: 0;
		}
	}
</style>
