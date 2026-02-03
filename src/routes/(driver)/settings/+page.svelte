<!--
	Driver Settings - Preferences Page

	Allows drivers to set preferred work days and routes.
	Shows countdown to lock deadline (Sunday 23:59).
	Auto-saves on change with optimistic UI.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import Checkbox from '$lib/components/primitives/Checkbox.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import Clock from '$lib/components/icons/Clock.svelte';
	import Lock from '$lib/components/icons/Lock.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';
	import { preferencesStore, type RouteDetail } from '$lib/stores/preferencesStore.svelte';
	import type { SelectOption } from '$lib/schemas/ui/select';

	// Day definitions (0 = Sunday)
	const DAYS = [
		{ value: 0, label: m.preferences_day_sunday(), short: m.preferences_day_sun() },
		{ value: 1, label: m.preferences_day_monday(), short: m.preferences_day_mon() },
		{ value: 2, label: m.preferences_day_tuesday(), short: m.preferences_day_tue() },
		{ value: 3, label: m.preferences_day_wednesday(), short: m.preferences_day_wed() },
		{ value: 4, label: m.preferences_day_thursday(), short: m.preferences_day_thu() },
		{ value: 5, label: m.preferences_day_friday(), short: m.preferences_day_fri() },
		{ value: 6, label: m.preferences_day_saturday(), short: m.preferences_day_sat() }
	];

	// Route search state
	let routeSearchValue = $state<string | undefined>(undefined);
	let routeOptions = $state<SelectOption[]>([]);

	// Countdown display
	let countdownText = $state('');
	let countdownInterval: ReturnType<typeof setInterval> | null = null;

	// Check if a day is selected
	function isDaySelected(day: number): boolean {
		return preferencesStore.preferences?.preferredDays?.includes(day) ?? false;
	}

	// Toggle day preference
	function handleDayToggle(day: number) {
		if (preferencesStore.isLocked) return;
		preferencesStore.toggleDay(day);
	}

	// Fetch routes for combobox
	async function fetchRoutes(query = ''): Promise<{ options: SelectOption[]; hasMore: boolean }> {
		const params = new URLSearchParams();
		if (query) params.set('q', query);

		const res = await fetch(`/api/preferences/routes?${params}`);
		if (!res.ok) return { options: [], hasMore: false };

		const data = await res.json();
		return {
			options: data.routes.map((r: RouteDetail) => ({
				value: r.id,
				label: `${r.name} (${r.warehouseName})`
			})),
			hasMore: false
		};
	}

	// Handle route selection
	function handleRouteSelect(option: SelectOption) {
		const currentRoutes = preferencesStore.preferences?.preferredRoutes ?? [];
		const currentDetails = preferencesStore.preferences?.preferredRoutesDetails ?? [];

		if (currentRoutes.length >= 3) return;
		if (currentRoutes.includes(option.value as string)) return;

		const newRouteIds = [...currentRoutes, option.value as string];

		// Parse route details from label
		const labelMatch = (option.label as string).match(/^(.+) \((.+)\)$/);
		const newDetail: RouteDetail = {
			id: option.value as string,
			name: labelMatch?.[1] ?? option.label,
			warehouseName: labelMatch?.[2] ?? ''
		};
		const newDetails = [...currentDetails, newDetail];

		preferencesStore.updateRoutes(newRouteIds, newDetails);
		routeSearchValue = undefined;
	}

	// Remove a route
	function handleRouteRemove(routeId: string) {
		if (preferencesStore.isLocked) return;

		const currentRoutes = preferencesStore.preferences?.preferredRoutes ?? [];
		const currentDetails = preferencesStore.preferences?.preferredRoutesDetails ?? [];

		const newRouteIds = currentRoutes.filter((id) => id !== routeId);
		const newDetails = currentDetails.filter((d) => d.id !== routeId);

		preferencesStore.updateRoutes(newRouteIds, newDetails);
	}

	// Update countdown display
	function updateCountdown() {
		const deadline = preferencesStore.lockDeadline;
		if (!deadline) {
			countdownText = '';
			return;
		}

		const now = new Date();
		const diff = deadline.getTime() - now.getTime();

		if (diff <= 0) {
			countdownText = '';
			return;
		}

		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

		if (days > 0) {
			countdownText = `${days}d ${hours}h`;
		} else if (hours > 0) {
			countdownText = `${hours}h ${minutes}m`;
		} else {
			countdownText = `${minutes}m`;
		}
	}

	// Route datasource for Combobox
	const routeDataSource = {
		fetchPage: async ({
			query
		}: {
			query?: string;
			cursor?: unknown;
			limit?: number;
			signal?: AbortSignal;
		}) => {
			return fetchRoutes(query ?? '');
		}
	};

	const selectedRouteCount = $derived(preferencesStore.preferences?.preferredRoutes?.length ?? 0);

	const canAddRoute = $derived(selectedRouteCount < 3 && !preferencesStore.isLocked);

	onMount(() => {
		preferencesStore.load();
		updateCountdown();
		countdownInterval = setInterval(updateCountdown, 60000);

		return () => {
			if (countdownInterval) clearInterval(countdownInterval);
		};
	});
</script>

<svelte:head>
	<title>{m.preferences_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.preferences_page_title()}</h1>
				<p>{m.preferences_page_description()}</p>
			</div>

			{#if preferencesStore.isLocked}
				{#snippet lockIcon()}
					<Icon><Lock /></Icon>
				{/snippet}
				<Chip
					variant="status"
					status="warning"
					size="sm"
					icon={lockIcon}
					label={m.preferences_locked_message()}
				/>
			{:else if countdownText}
				{#snippet clockIcon()}
					<Icon><Clock /></Icon>
				{/snippet}
				<Chip
					variant="status"
					status="info"
					size="sm"
					icon={clockIcon}
					label={m.preferences_lock_countdown({ time: countdownText })}
				/>
			{/if}
		</div>

		{#if preferencesStore.isLoading}
			<div class="loading-state">
				<Spinner size={24} label="Loading preferences..." />
			</div>
		{:else}
			<div class="sections">
				<!-- Preferred Days Section -->
				<section class="section">
					<div class="section-header">
						<h2>{m.preferences_days_section()}</h2>
						<p>{m.preferences_days_description()}</p>
					</div>

					<div class="days-grid">
						{#each DAYS as day (day.value)}
							<button
								class="day-card"
								class:selected={isDaySelected(day.value)}
								class:disabled={preferencesStore.isLocked}
								onclick={() => handleDayToggle(day.value)}
								disabled={preferencesStore.isLocked}
								aria-pressed={isDaySelected(day.value)}
							>
								<span class="day-short">{day.short}</span>
								<Checkbox
									checked={isDaySelected(day.value)}
									disabled={preferencesStore.isLocked}
									ariaLabel={day.label}
								/>
							</button>
						{/each}
					</div>
				</section>

				<!-- Preferred Routes Section -->
				<section class="section">
					<div class="section-header">
						<h2>{m.preferences_routes_section()}</h2>
						<p>{m.preferences_routes_description()}</p>
					</div>

					<div class="routes-content">
						{#if canAddRoute}
							<div class="route-search">
								<Combobox
									dataSource={routeDataSource}
									bind:value={routeSearchValue}
									placeholder={m.preferences_routes_placeholder()}
									onSelect={handleRouteSelect}
									disabled={preferencesStore.isLocked || selectedRouteCount >= 3}
								/>
								<span class="route-limit">{m.preferences_routes_max()}</span>
							</div>
						{/if}

						<div class="selected-routes">
							{#if selectedRouteCount === 0}
								<p class="no-routes">{m.preferences_no_routes()}</p>
							{:else}
								{#each preferencesStore.preferences?.preferredRoutesDetails ?? [] as route (route.id)}
									<div class="route-chip">
										<div class="route-info">
											<span class="route-name">{route.name}</span>
											<span class="route-warehouse">{route.warehouseName}</span>
										</div>
										{#if !preferencesStore.isLocked}
											<button
												class="remove-btn"
												onclick={() => handleRouteRemove(route.id)}
												aria-label={m.preferences_remove_route()}
											>
												<Icon size="small"><XIcon /></Icon>
											</button>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</section>
			</div>
		{/if}

		{#if preferencesStore.isSaving}
			<div class="saving-indicator">
				<Spinner size={16} />
			</div>
		{/if}
	</div>
</div>

<style>
	.page-surface {
		min-height: 100vh;
		background: var(--surface-secondary);
	}

	.page-stage {
		max-width: 600px;
		margin: 0 auto;
		padding: var(--spacing-4);
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-6);
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.header-text p {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.loading-state {
		display: flex;
		justify-content: center;
		padding: var(--spacing-8);
	}

	.sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.section {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-4);
	}

	.section-header {
		margin-bottom: var(--spacing-4);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.section-header p {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.days-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: var(--spacing-2);
	}

	@media (max-width: 480px) {
		.days-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	.day-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-3) var(--spacing-2);
		background: var(--surface-secondary);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		cursor: pointer;
		transition: all var(--transition-duration-200) ease;
	}

	.day-card:hover:not(.disabled) {
		border-color: var(--interactive-hover);
	}

	.day-card.selected {
		background: var(--interactive-accent-muted);
		border-color: var(--interactive-accent);
	}

	.day-card.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.day-short {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.routes-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.route-search {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.route-limit {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.selected-routes {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.no-routes {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		font-style: italic;
	}

	.route-chip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--surface-secondary);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
	}

	.route-info {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-width: 0;
		flex: 1;
	}

	.route-name {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.route-warehouse {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		transition: all var(--transition-duration-100) ease;
		flex-shrink: 0;
	}

	.remove-btn:hover {
		background: var(--surface-tertiary);
		color: var(--status-error);
	}

	.saving-indicator {
		position: fixed;
		bottom: var(--spacing-4);
		right: var(--spacing-4);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--surface-primary);
		border-radius: var(--radius-full);
		box-shadow: var(--shadow-lg);
	}
</style>
