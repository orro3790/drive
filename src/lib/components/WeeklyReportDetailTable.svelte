<!--
	Weekly Report Detail Table

	Displays individual shift records for a specific week.
	Fetches data from /api/weekly-reports/{weekStart} on mount.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
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
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Filter from '$lib/components/icons/Filter.svelte';
	import Reset from '$lib/components/icons/Reset.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { WeekShiftRecord } from '$lib/schemas/weeklyReports';

	type Props = {
		weekStart: string;
		tabs?: Snippet;
		isWideMode?: boolean;
		onWideModeChange?: (value: boolean) => void;
	};

	let { weekStart, tabs, isWideMode = false, onWideModeChange }: Props = $props();

	let shifts = $state<WeekShiftRecord[]>([]);
	let isLoading = $state(true);
	let sorting = $state<SortingState>([{ id: 'date', desc: true }]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	// Filter state
	let showFilterDrawer = $state(false);
	let driverFilter = $state('');
	let routeFilter = $state('');
	let warehouseFilter = $state('');

	const filteredShifts = $derived.by(() => {
		let data = shifts;
		if (driverFilter) {
			const lower = driverFilter.toLowerCase();
			data = data.filter((s) => s.driverName.toLowerCase().includes(lower));
		}
		if (routeFilter) {
			const lower = routeFilter.toLowerCase();
			data = data.filter((s) => s.routeName.toLowerCase().includes(lower));
		}
		if (warehouseFilter) {
			const lower = warehouseFilter.toLowerCase();
			data = data.filter((s) => s.warehouseName.toLowerCase().includes(lower));
		}
		return data;
	});

	function resetFilters() {
		driverFilter = '';
		routeFilter = '';
		warehouseFilter = '';
	}

	const helper = createColumnHelper<WeekShiftRecord>();

	const columns = [
		helper.text('date', {
			header: m.weekly_reports_detail_date(),
			sortable: true,
			sizing: 'fixed',
			width: 150,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('routeName', {
			header: m.weekly_reports_detail_route(),
			sortable: true,
			sizing: 'fixed',
			width: 240,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.text('warehouseName', {
			header: m.weekly_reports_detail_warehouse(),
			sortable: true,
			sizing: 'fixed',
			width: 220
		}),
		helper.text('driverName', {
			header: m.weekly_reports_detail_driver(),
			sortable: true,
			sizing: 'fixed',
			width: 240
		}),
		helper.number('parcelsStart', {
			header: m.weekly_reports_detail_parcels_start(),
			sortable: true,
			sizing: 'fixed',
			width: 130
		}),
		helper.number('parcelsDelivered', {
			header: m.weekly_reports_detail_parcels_delivered(),
			sortable: true,
			sizing: 'fixed',
			width: 150
		}),
		helper.number('parcelsReturned', {
			header: m.weekly_reports_detail_parcels_returned(),
			sortable: true,
			sizing: 'fixed',
			width: 150
		}),
		helper.number('exceptedReturns', {
			header: m.weekly_reports_detail_exceptions(),
			sortable: true,
			sizing: 'fixed',
			width: 150
		}),
		helper.text('exceptionNotes', {
			header: m.weekly_reports_detail_exception_notes(),
			sortable: false,
			sizing: 'fixed',
			width: 240
		}),
		helper.accessor('completedAt', (row) => row.completedAt, {
			header: m.weekly_reports_detail_completed(),
			sortable: true,
			sizing: 'fixed',
			width: 160
		})
	];

	const table = createSvelteTable<WeekShiftRecord>(() => ({
		data: filteredShifts,
		columns,
		getRowId: (row) => row.assignmentId,
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

	function formatTimestamp(ts: string | null): string {
		if (!ts) return '\u2014';
		const d = new Date(ts);
		return d.toLocaleTimeString(undefined, {
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	onMount(async () => {
		try {
			const res = await fetch(`/api/weekly-reports/${weekStart}`);
			if (!res.ok) throw new Error('Failed to load week detail');
			const data = await res.json();
			shifts = data.shifts ?? [];
		} catch {
			toastStore.error(m.weekly_reports_empty_message());
		} finally {
			isLoading = false;
		}
	});
</script>

{#snippet completedCell(ctx: CellRendererContext<WeekShiftRecord>)}
	<span class="timestamp">{formatTimestamp(ctx.row.completedAt)}</span>
{/snippet}

{#snippet notesCell(ctx: CellRendererContext<WeekShiftRecord>)}
	{#if ctx.row.exceptionNotes}
		<span class="notes" title={ctx.row.exceptionNotes}>{ctx.row.exceptionNotes}</span>
	{:else}
		<span class="empty-cell">&mdash;</span>
	{/if}
{/snippet}

{#snippet toolbarSnippet()}
	<IconButton tooltip={m.table_filter_label()} onclick={() => (showFilterDrawer = true)}>
		<Icon><Filter /></Icon>
	</IconButton>

	<IconButton tooltip={m.table_filter_reset()} onclick={resetFilters}>
		<Icon><Reset /></Icon>
	</IconButton>
{/snippet}

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
		completedAt: completedCell,
		exceptionNotes: notesCell
	}}
	{isWideMode}
	{onWideModeChange}
	stateStorageKey={`weekly-report-${weekStart}`}
	exportFilename={`weekly-report-${weekStart}`}
	{tabs}
	toolbar={toolbarSnippet}
/>

<!-- Filter Drawer -->
{#if showFilterDrawer}
	<Drawer title={m.table_filter_title()} onClose={() => (showFilterDrawer = false)}>
		<div class="filter-form">
			<div class="filter-field">
				<label for="detail-driver-filter">{m.weekly_reports_filter_driver_label()}</label>
				<InlineEditor
					id="detail-driver-filter"
					value={driverFilter}
					onInput={(v) => (driverFilter = v)}
					placeholder={m.weekly_reports_filter_driver_placeholder()}
				/>
			</div>
			<div class="filter-field">
				<label for="detail-route-filter">{m.weekly_reports_filter_route_label()}</label>
				<InlineEditor
					id="detail-route-filter"
					value={routeFilter}
					onInput={(v) => (routeFilter = v)}
					placeholder={m.weekly_reports_filter_route_placeholder()}
				/>
			</div>
			<div class="filter-field">
				<label for="detail-warehouse-filter">{m.weekly_reports_filter_warehouse_label()}</label>
				<InlineEditor
					id="detail-warehouse-filter"
					value={warehouseFilter}
					onInput={(v) => (warehouseFilter = v)}
					placeholder={m.weekly_reports_filter_warehouse_placeholder()}
				/>
			</div>
			<div class="filter-actions">
				<Button variant="secondary" onclick={resetFilters} fill>
					{m.table_filter_clear_all()}
				</Button>
				<Button onclick={() => (showFilterDrawer = false)} fill>
					{m.common_confirm()}
				</Button>
			</div>
		</div>
	</Drawer>
{/if}

<style>
	.timestamp {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.notes {
		font-size: var(--font-size-sm);
		color: var(--text-normal);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.empty-cell {
		color: var(--text-muted);
	}

	.filter-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		padding: var(--spacing-4);
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.filter-field label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.filter-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}
</style>
