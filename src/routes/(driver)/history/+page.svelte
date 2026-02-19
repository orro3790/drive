<!--
	Driver Shift History

	Displays past completed shifts with parcel counts and details.
	Uses pagination with "Load More" button.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { format, parseISO } from 'date-fns';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import IconBase from '$lib/components/primitives/Icon.svelte';
	import IconCircle from '$lib/components/primitives/IconCircle.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
	import CalendarX from '$lib/components/icons/CalendarX.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';
	import { statusLabels } from '$lib/config/lifecycleLabels';
	import type { AssignmentStatus } from '$lib/schemas/assignment';

	type HistoryShift = {
		id: string;
		date: string;
		status: AssignmentStatus;
		routeName: string;
		warehouseName: string;
		shift: {
			parcelsStart: number | null;
			parcelsDelivered: number | null;
			parcelsReturned: number | null;
			exceptedReturns: number;
			exceptionNotes: string | null;
			arrivedAt: string | null;
			completedAt: string | null;
		} | null;
	};

	let history = $state<HistoryShift[]>([]);
	let isLoading = $state(true);
	let isLoadingMore = $state(false);
	let hasMore = $state(false);
	let error = $state<string | null>(null);
	let offset = $state(0);
	const LIMIT = 20;

	async function loadHistory(loadMore = false) {
		if (loadMore) {
			isLoadingMore = true;
		} else {
			isLoading = true;
			offset = 0;
		}
		error = null;

		try {
			const res = await fetch(`/api/history?offset=${offset}&limit=${LIMIT}`);
			if (!res.ok) {
				throw new Error('Failed to load history');
			}

			const data = await res.json();
			if (loadMore) {
				history = [...history, ...data.history];
			} else {
				history = data.history;
			}
			hasMore = data.pagination.hasMore;
			offset = data.pagination.offset + data.history.length;
		} catch (err) {
			error = err instanceof Error ? err.message : m.history_load_error();
		} finally {
			isLoading = false;
			isLoadingMore = false;
		}
	}

	function handleLoadMore() {
		void loadHistory(true);
	}

	function formatHistoryDate(dateStr: string): string {
		const date = parseISO(dateStr);
		return format(date, 'EEE, MMM d');
	}

	onMount(() => {
		void loadHistory();
	});
</script>

{#snippet routeChipIcon()}
	<IconBase size="small">
		<RouteIcon />
	</IconBase>
{/snippet}

{#snippet warehouseChipIcon()}
	<IconBase size="small">
		<WarehouseIcon />
	</IconBase>
{/snippet}

<svelte:head>
	<title>{m.history_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage" data-testid="history-list" data-loaded={isLoading ? 'false' : 'true'}>
		<div class="page-header">
			<div class="header-text">
				<h1>{m.history_page_title()}</h1>
				<p>{m.history_page_description()}</p>
			</div>
		</div>

		{#if isLoading}
			<div class="loading-state">
				<Spinner size={24} label={m.common_loading()} />
			</div>
		{:else if error}
			<NoticeBanner variant="warning">
				<p>{m.history_load_error()}</p>
			</NoticeBanner>
		{:else if history.length === 0}
			<div class="empty-state">
				<h3>{m.history_empty_title()}</h3>
				<p>{m.history_empty_message()}</p>
			</div>
		{:else}
			<div class="history-list">
				{#each history as item (item.id)}
					{@const isCompleted = item.status === 'completed'}
					<div class="history-item" data-history-id={item.id}>
						<IconCircle color={isCompleted ? '--status-success' : '--text-muted'}>
							{#if isCompleted}
								<CheckCircleIcon />
							{:else}
								<CalendarX />
							{/if}
						</IconCircle>
						<div class="history-content">
							<div class="history-header">
								<div class="history-when">
									<span class="history-date">{formatHistoryDate(item.date)}</span>
								</div>
								<Chip
									variant="status"
									status={isCompleted ? 'success' : 'neutral'}
									label={statusLabels[item.status]}
									size="xs"
								/>
							</div>
							{#if item.shift && isCompleted}
								<div class="parcel-summary">
									{#if item.shift.parcelsDelivered !== null}
										<span class="parcel-stat delivered">
											{item.shift.parcelsDelivered} delivered
										</span>
									{/if}
									{#if item.shift.parcelsReturned !== null && item.shift.parcelsReturned > 0}
										<span class="parcel-stat returned">
											{item.shift.parcelsReturned} returned
										</span>
									{/if}
									{#if item.shift.exceptedReturns > 0}
										<span class="parcel-stat excepted">
											{item.shift.exceptedReturns} excepted
										</span>
									{/if}
								</div>
							{/if}
							<div class="history-meta">
								<Chip
									variant="tag"
									size="xs"
									color="var(--text-muted)"
									label={item.routeName}
									icon={routeChipIcon}
								/>
								<Chip
									variant="tag"
									size="xs"
									color="var(--text-muted)"
									label={item.warehouseName}
									icon={warehouseChipIcon}
								/>
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if hasMore}
				<div class="load-more">
					<Button variant="secondary" onclick={handleLoadMore} isLoading={isLoadingMore}>
						{m.history_load_more()}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.page-surface {
		flex: 1;
		background: var(--surface-inset);
	}

	.page-stage {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--spacing-4);
		width: 100%;
	}

	.page-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-5);
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		padding-left: var(--spacing-2);
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.header-text p {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	.loading-state {
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-6) var(--spacing-4);
		color: var(--text-muted);
	}

	.empty-state h3 {
		margin: 0 0 var(--spacing-1);
		font-size: var(--font-size-lg);
		color: var(--text-normal);
	}

	.empty-state p {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.history-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.history-item {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		border-radius: var(--radius-lg);
		opacity: 0.7;
	}

	.history-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		min-width: 0;
	}

	.history-header {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-2);
	}

	.history-when {
		display: flex;
		flex-direction: column;
		gap: 1px;
		margin-right: auto;
		min-width: 0;
	}

	.history-date {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
		line-height: 1.3;
	}

	.parcel-summary {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-2);
		font-size: var(--font-size-xs);
	}

	.parcel-stat {
		color: var(--text-muted);
	}

	.parcel-stat.delivered {
		color: var(--status-success);
	}

	.parcel-stat.returned {
		color: var(--status-warning);
	}

	.parcel-stat.excepted {
		color: var(--text-faint);
	}

	.history-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1);
		align-items: center;
	}

	.load-more {
		display: flex;
		justify-content: center;
		padding: var(--spacing-4);
	}

	@media (max-width: 767px) {
		.page-stage {
			padding: var(--spacing-2);
		}

		.page-header {
			gap: var(--spacing-2);
			margin-bottom: var(--spacing-3);
		}

		.header-text h1 {
			font-size: var(--font-size-lg);
		}

		.history-item {
			gap: var(--spacing-2);
			padding: var(--spacing-3);
		}
	}
</style>
