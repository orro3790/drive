<!--
@component
DriverPreferencesSection - Preference controls for driver settings.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import SettingsRow from './SettingsRow.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Combobox from '$lib/components/Combobox.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import CircleCheckFill from '$lib/components/icons/CircleCheckFill.svelte';
	import Minus from '$lib/components/icons/Minus.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';
	import { preferencesStore, type RouteDetail } from '$lib/stores/preferencesStore.svelte';
	import type { SelectOption } from '$lib/schemas/ui/select';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import { formatUiDateTime } from '$lib/utils/date/formatting';

	let routeResetKey = $state(0);
	let routeSelection = $state<string | number | undefined>(undefined);
	let hasRouteLoadError = $state(false);

	const dayOptions = $derived.by(() => [
		{ value: 0, short: m.preferences_day_sun(), full: m.preferences_day_sunday() },
		{ value: 1, short: m.preferences_day_mon(), full: m.preferences_day_monday() },
		{ value: 2, short: m.preferences_day_tue(), full: m.preferences_day_tuesday() },
		{ value: 3, short: m.preferences_day_wed(), full: m.preferences_day_wednesday() },
		{ value: 4, short: m.preferences_day_thu(), full: m.preferences_day_thursday() },
		{ value: 5, short: m.preferences_day_fri(), full: m.preferences_day_friday() },
		{ value: 6, short: m.preferences_day_sat(), full: m.preferences_day_saturday() }
	]);

	const preferredDays = $derived(preferencesStore.preferences?.preferredDays ?? []);
	const selectedRoutes = $derived(preferencesStore.preferences?.preferredRoutesDetails ?? []);
	const selectedRouteIds = $derived(preferencesStore.preferences?.preferredRoutes ?? []);
	const selectedRouteCount = $derived(selectedRouteIds.length);
	const remainingRouteCount = $derived(Math.max(0, 3 - selectedRouteCount));
	const hasAllRoutePreferences = $derived(selectedRouteCount >= 3);
	const isLocked = $derived(preferencesStore.isLocked);
	const isLoading = $derived(preferencesStore.isLoading);
	const isSaving = $derived(preferencesStore.isSaving);
	const routeLimitReached = $derived(selectedRouteIds.length >= 3);
	const routesStatusText = $derived.by(() => {
		if (hasAllRoutePreferences) {
			return 'Route preferences set (3/3)';
		}

		return `${remainingRouteCount} route${remainingRouteCount === 1 ? '' : 's'} remaining (${selectedRouteCount}/3)`;
	});

	const lockStatus = $derived.by(() => {
		if (preferencesStore.isLocked && preferencesStore.lockedUntil) {
			return m.preferences_locked_until({
				date: formatUiDateTime(preferencesStore.lockedUntil)
			});
		}
		if (preferencesStore.lockDeadline) {
			return m.preferences_lock_countdown({
				time: formatUiDateTime(preferencesStore.lockDeadline)
			});
		}
		return '';
	});

	const routeDataSource = {
		fetchPage: async ({
			query,
			signal
		}: {
			query?: string;
			cursor?: unknown;
			limit?: number;
			signal?: AbortSignal;
		}) => {
			const params = query ? `?q=${encodeURIComponent(query)}` : '';
			try {
				const res = await fetch(`/api/preferences/routes${params}`, { signal });
				if (!res.ok) {
					throw new Error('route-load-failed');
				}
				const data = await res.json();
				const options = (data.routes ?? []).map((route: RouteDetail) => ({
					value: route.id,
					label: `${route.name} - ${route.warehouseName}`,
					meta: route
				}));
				return { options, hasMore: false };
			} catch (err) {
				const isAbort = err instanceof Error && err.name === 'AbortError';
				if (!isAbort && !hasRouteLoadError) {
					hasRouteLoadError = true;
					toastStore.error(m.preferences_load_error());
				}
				return { options: [], hasMore: false };
			}
		}
	} satisfies {
		fetchPage: (args: {
			query?: string;
			cursor?: unknown;
			limit?: number;
			signal?: AbortSignal;
		}) => Promise<{ options: SelectOption[]; hasMore: boolean }>;
	};

	onMount(() => {
		if (!preferencesStore.preferences && !preferencesStore.isLoading) {
			void preferencesStore.load();
		}
	});

	function handleRouteSelect(option: SelectOption) {
		if (isLocked) {
			return;
		}

		if (routeLimitReached) {
			toastStore.error(m.preferences_routes_max());
			routeSelection = undefined;
			routeResetKey += 1;
			return;
		}

		const routeId = String(option.value);
		if (selectedRouteIds.includes(routeId)) {
			routeSelection = undefined;
			routeResetKey += 1;
			return;
		}

		const meta = option.meta as RouteDetail | undefined;
		const routeDetail: RouteDetail = meta ?? {
			id: routeId,
			name: option.label,
			warehouseName: ''
		};

		const nextIds = [...selectedRouteIds, routeId].slice(0, 3);
		const nextDetails = [...selectedRoutes, routeDetail].filter(
			(route, index, list) => list.findIndex((item) => item.id === route.id) === index
		);

		preferencesStore.updateRoutes(nextIds, nextDetails);
		routeSelection = undefined;
		routeResetKey += 1;
	}

	function removeRoute(routeId: string) {
		if (isLocked) return;
		const nextIds = selectedRouteIds.filter((id) => id !== routeId);
		const nextDetails = selectedRoutes.filter((route) => route.id !== routeId);
		preferencesStore.updateRoutes(nextIds, nextDetails);
	}
</script>

{#snippet routeChipIcon()}
	<Icon size="small">
		<RouteIcon />
	</Icon>
{/snippet}

{#snippet warehouseChipIcon()}
	<Icon size="small">
		<WarehouseIcon />
	</Icon>
{/snippet}

{#if isLoading && !preferencesStore.preferences}
	<SettingsRow ariaDisabled={true}>
		{#snippet label()}
			<div class="title">{m.preferences_days_section()}</div>
			<div class="desc">{lockStatus || m.preferences_days_description()}</div>
		{/snippet}
		{#snippet control()}
			<div class="preferences-loading" aria-live="polite">
				<Spinner size={18} label={m.common_loading()} />
				<span>{m.common_loading()}</span>
			</div>
		{/snippet}
	</SettingsRow>
{:else}
	<SettingsRow ariaDisabled={isLocked || isSaving}>
		{#snippet label()}
			<div class="title">{m.preferences_days_section()}</div>
			<div class="desc">{lockStatus || m.preferences_days_description()}</div>
		{/snippet}
		{#snippet children()}
			<div class="preferences-row-stack">
				{#if isLocked}
					<NoticeBanner variant="warning">
						<div class="lock-banner">
							<span>{m.preferences_locked_message()}</span>
							{#if preferencesStore.lockedUntil}
								<span>
									{m.preferences_locked_until({
										date: formatUiDateTime(preferencesStore.lockedUntil)
									})}
								</span>
							{/if}
						</div>
					</NoticeBanner>
				{/if}

				<div class="days-grid">
					{#each dayOptions as day (day.value)}
						{@const isSelected = preferredDays.includes(day.value)}
						<Button
							type="button"
							variant="ghost"
							size="compact"
							class={`day-toggle ${isSelected ? 'day-toggle-active' : 'day-toggle-inactive'}`}
							aria-label={day.full}
							aria-pressed={isSelected}
							disabled={isLocked || isSaving}
							onclick={() => preferencesStore.toggleDay(day.value)}
						>
							{day.short}
						</Button>
					{/each}
				</div>
			</div>
		{/snippet}
	</SettingsRow>

	<SettingsRow ariaDisabled={isLocked || isSaving}>
		{#snippet label()}
			<div class="title">{m.preferences_routes_section()}</div>
			<div class="desc routes-desc" class:routes-desc-success={hasAllRoutePreferences}>
				{#if hasAllRoutePreferences}
					<Icon size="small" color="var(--status-success)"><CircleCheckFill /></Icon>
				{/if}
				<span>{routesStatusText}</span>
			</div>
		{/snippet}
		{#snippet children()}
			<div class="routes-stack">
				{#key routeResetKey}
					<Combobox
						dataSource={routeDataSource}
						bind:value={routeSelection}
						placeholder={m.preferences_routes_placeholder()}
						searchPlaceholder={m.preferences_routes_placeholder()}
						aria-label={m.preferences_routes_aria_label()}
						disabled={isLocked || isSaving}
						onSelect={handleRouteSelect}
						size="sm"
					/>
				{/key}

				{#if selectedRoutes.length === 0}
					<p class="route-empty">{m.preferences_no_routes()}</p>
				{:else}
					<div class="route-list">
						{#each selectedRoutes as route (route.id)}
							<div class="route-item">
								<div class="route-meta">
									<Chip
										variant="tag"
										size="xs"
										color="var(--text-muted)"
										label={route.name}
										icon={routeChipIcon}
									/>
									{#if route.warehouseName}
										<Chip
											variant="tag"
											size="xs"
											color="var(--text-muted)"
											label={route.warehouseName}
											icon={warehouseChipIcon}
										/>
									{/if}
								</div>
								<IconButton
									tooltip={m.preferences_remove_route()}
									aria-label={m.preferences_remove_route_label({ route: route.name })}
									noBackground
									onclick={() => removeRoute(route.id)}
									disabled={isLocked || isSaving}
								>
									<Icon><Minus /></Icon>
								</IconButton>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/snippet}
	</SettingsRow>
{/if}

<style>
	.preferences-row-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.lock-banner {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.desc.routes-desc {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		letter-spacing: normal;
	}

	.desc.routes-desc.routes-desc-success {
		color: var(--status-success);
		font-weight: var(--font-weight-medium);
	}

	.preferences-loading {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-2);
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		padding: var(--spacing-2) 0;
	}

	.days-grid {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-2);
	}

	.days-grid :global(.day-toggle) {
		width: auto;
		flex: 0 0 auto;
		justify-content: center;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		letter-spacing: normal;
		text-transform: none;
		border-radius: var(--radius-full);
		border: none;
		min-height: 28px;
		padding: 2px var(--spacing-2);
	}

	.days-grid :global(.day-toggle-inactive) {
		background: var(--interactive-normal);
		color: var(--text-normal);
	}

	.days-grid :global(.day-toggle-inactive:hover:not(:disabled)) {
		background: var(--interactive-hover);
		color: var(--text-normal);
	}

	.days-grid :global(.day-toggle-active) {
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		color: var(--status-success);
	}

	.days-grid :global(.day-toggle-active:hover:not(:disabled)) {
		background: color-mix(in srgb, var(--status-success) 20%, transparent);
		color: var(--status-success);
	}

	.routes-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.routes-stack :global(.combobox-trigger),
	.routes-stack :global(.combobox-trigger:focus),
	.routes-stack :global(.combobox-trigger:focus-visible),
	.routes-stack :global(.combobox-trigger[aria-expanded='true']) {
		background: var(--surface-primary);
	}

	.routes-stack :global(.search-input),
	.routes-stack :global(.search-input:focus),
	.routes-stack :global(.search-input:focus-visible) {
		background: var(--surface-primary);
		color: var(--text-normal);
	}

	.routes-stack :global(.search-input::placeholder) {
		color: var(--text-muted);
	}

	.route-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.route-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-2);
		padding: 0;
	}

	.route-meta {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		flex-wrap: wrap;
		flex: 1;
		min-width: 0;
	}

	.route-empty {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	@media (max-width: 767px) {
		.days-grid {
			gap: var(--spacing-1);
		}
	}
</style>
