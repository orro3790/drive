<!--
	Weekly Reports Page (Manager Dashboard)

	Displays aggregated parcel delivery totals per operational week.
	Click "View Details" to open a tab with individual shift records.
	Tab system follows the drivers page pattern.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import {
		DataTable,
		createSvelteTable,
		getCoreRowModel,
		getSortedRowModel,
		getPaginationRowModel,
		createColumnHelper,
		type SortingState,
		type PaginationState,
		type CellRendererContext
	} from '$lib/components/data-table';
	import Button from '$lib/components/primitives/Button.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import WeeklyReportDetailTable from '$lib/components/WeeklyReportDetailTable.svelte';
	import type { WeekSummary } from '$lib/schemas/weeklyReports';

	// Data state
	let weeks = $state<WeekSummary[]>([]);
	let isLoading = $state(true);

	// Table state
	let sorting = $state<SortingState>([]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	// Tab state
	type WeekTab = { weekStart: string; weekLabel: string };
	let openWeekTabs = $state<WeekTab[]>([]);
	let activeTabId = $state<string>('reports');
	let tabsInitialized = $state(false);
	let isWideMode = $state(false);
	const TABS_STORAGE_KEY = 'weekly-reports-open-tabs';

	const helper = createColumnHelper<WeekSummary>();

	const columns = [
		helper.text('weekLabel', {
			header: m.weekly_reports_header_week(),
			sortable: true,
			sizing: 'fixed',
			width: 220,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('weekStart', {
			header: m.weekly_reports_header_start_date(),
			sortable: true,
			sizing: 'fixed',
			width: 130
		}),
		helper.text('weekEnd', {
			header: m.weekly_reports_header_end_date(),
			sortable: true,
			sizing: 'fixed',
			width: 130
		}),
		helper.number('shiftCount', {
			header: m.weekly_reports_header_shifts(),
			sortable: true,
			sizing: 'fixed',
			width: 100,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.number('totalDelivered', {
			header: m.weekly_reports_header_total_delivered(),
			sortable: true,
			sizing: 'fixed',
			width: 140
		}),
		helper.number('totalReturned', {
			header: m.weekly_reports_header_total_returned(),
			sortable: true,
			sizing: 'fixed',
			width: 140
		}),
		helper.number('totalExcepted', {
			header: m.weekly_reports_header_total_excepted(),
			sortable: true,
			sizing: 'fixed',
			width: 140
		}),
		helper.accessor('actions', () => '', {
			header: m.common_actions(),
			sortable: false,
			sizing: 'fixed',
			width: 140
		})
	];

	const table = createSvelteTable<WeekSummary>(() => ({
		data: weeks,
		columns,
		getRowId: (row) => row.weekStart,
		state: { sorting, pagination },
		enableColumnResizing: true,
		columnResizeMode: 'onChange',
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		onPaginationChange: (updater) => {
			pagination = typeof updater === 'function' ? updater(pagination) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	}));

	// Tab management
	function openWeekTab(week: WeekSummary) {
		if (!openWeekTabs.some((t) => t.weekStart === week.weekStart)) {
			openWeekTabs = [...openWeekTabs, { weekStart: week.weekStart, weekLabel: week.weekLabel }];
		}
		activeTabId = week.weekStart;
	}

	function closeWeekTab(weekStart: string, event: Event) {
		event.stopPropagation();
		openWeekTabs = openWeekTabs.filter((t) => t.weekStart !== weekStart);
		if (activeTabId === weekStart) {
			activeTabId = 'reports';
		}
	}

	function switchToTab(tabId: string) {
		if (tabId === activeTabId) return;
		activeTabId = tabId;
	}

	onMount(async () => {
		// Restore persisted tabs
		const stored = localStorage.getItem(TABS_STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				openWeekTabs = parsed.tabs ?? [];
				activeTabId = parsed.activeTabId ?? 'reports';
			} catch {
				/* ignore corrupt data */
			}
		}
		tabsInitialized = true;

		// Load data
		try {
			const res = await fetch('/api/weekly-reports');
			if (!res.ok) throw new Error('Failed to load weekly reports');
			const data = await res.json();
			weeks = data.weeks ?? [];
		} catch {
			toastStore.error(m.weekly_reports_empty_message());
		} finally {
			isLoading = false;
		}
	});

	// Persist tab state
	$effect(() => {
		if (!tabsInitialized) return;
		localStorage.setItem(
			TABS_STORAGE_KEY,
			JSON.stringify({
				tabs: openWeekTabs,
				activeTabId
			})
		);
	});
</script>

{#snippet actionsCell(ctx: CellRendererContext<WeekSummary>)}
	<Button variant="secondary" size="small" onclick={() => openWeekTab(ctx.row)}>
		{m.weekly_reports_view_details()}
	</Button>
{/snippet}

{#snippet tabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button
			type="button"
			class="tab"
			class:active={activeTabId === 'reports'}
			role="tab"
			aria-selected={activeTabId === 'reports'}
			tabindex={activeTabId === 'reports' ? 0 : -1}
			onclick={() => switchToTab('reports')}
		>
			{m.weekly_reports_page_title()}
		</button>
		{#each openWeekTabs as weekTab (weekTab.weekStart)}
			<button
				type="button"
				class="tab"
				class:active={activeTabId === weekTab.weekStart}
				role="tab"
				aria-selected={activeTabId === weekTab.weekStart}
				tabindex={activeTabId === weekTab.weekStart ? 0 : -1}
				onclick={() => switchToTab(weekTab.weekStart)}
			>
				<span class="tab-label">{weekTab.weekLabel}</span>
				<span
					role="button"
					tabindex="-1"
					class="tab-close"
					aria-label={m.weekly_reports_close_tab()}
					onclick={(e) => closeWeekTab(weekTab.weekStart, e)}
					onkeydown={(e) => e.key === 'Enter' && closeWeekTab(weekTab.weekStart, e)}
				>
					&times;
				</span>
			</button>
		{/each}
	</div>
{/snippet}

<svelte:head>
	<title>{m.weekly_reports_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	{#if activeTabId === 'reports'}
		<DataTable
			{table}
			loading={isLoading}
			emptyTitle={m.weekly_reports_empty()}
			emptyMessage={m.weekly_reports_empty_message()}
			showPagination
			showSelection={false}
			showColumnVisibility
			showExport
			showWideModeToggle
			cellComponents={{
				actions: actionsCell
			}}
			{isWideMode}
			onWideModeChange={(v) => (isWideMode = v)}
			stateStorageKey="weekly-reports"
			exportFilename="weekly-reports"
			tabs={tabsSnippet}
		/>
	{:else}
		{#each openWeekTabs as weekTab (weekTab.weekStart)}
			{#if activeTabId === weekTab.weekStart}
				<WeeklyReportDetailTable
					weekStart={weekTab.weekStart}
					tabs={tabsSnippet}
					{isWideMode}
					onWideModeChange={(v) => (isWideMode = v)}
				/>
			{/if}
		{/each}
	{/if}
</div>

<style>
	/* Tab bar styling - matching Drive pattern (from drivers page) */
	.tab-bar {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		height: 48px;
		flex-shrink: 0;
		padding-bottom: 1px;
		margin-bottom: -1px;
	}

	.tab {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-1);
		padding: 0 var(--spacing-3);
		height: 32px;
		border: none;
		border-radius: var(--radius-lg);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		z-index: 1;
		transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.tab:not(.active):hover {
		background: var(--interactive-hover);
		color: var(--text-normal);
	}

	.tab.active {
		align-self: flex-end;
		height: 48px;
		background: var(--surface-primary);
		color: var(--text-normal);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		margin-bottom: -1px;
		z-index: 10;
	}

	.tab.active::before,
	.tab.active::after {
		content: '';
		position: absolute;
		bottom: 0;
		width: var(--radius-lg);
		height: var(--radius-lg);
		pointer-events: none;
		z-index: 1;
	}

	.tab.active::before {
		left: calc(var(--radius-lg) * -1);
		background: radial-gradient(
			circle at 0 0,
			transparent var(--radius-lg),
			var(--surface-primary) calc(var(--radius-lg) + 0.5px)
		);
	}

	.tab.active::after {
		right: calc(var(--radius-lg) * -1);
		background: radial-gradient(
			circle at 100% 0,
			transparent var(--radius-lg),
			var(--surface-primary) calc(var(--radius-lg) + 0.5px)
		);
	}

	.tab-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 180px;
	}

	.tab-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		margin-left: var(--spacing-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
		line-height: 1;
		cursor: pointer;
		flex-shrink: 0;
		padding: 0;
	}

	.tab-close:hover {
		background: var(--interactive-hover);
		color: var(--text-normal);
	}
</style>
