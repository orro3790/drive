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

	const helper = createColumnHelper<WeekShiftRecord>();

	const columns = [
		helper.text('date', {
			header: m.weekly_reports_detail_date(),
			sortable: true,
			sizing: 'fixed',
			width: 120,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('routeName', {
			header: m.weekly_reports_detail_route(),
			sortable: true,
			sizing: 'fixed',
			width: 200,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.text('warehouseName', {
			header: m.weekly_reports_detail_warehouse(),
			sortable: true,
			sizing: 'fixed',
			width: 180
		}),
		helper.text('driverName', {
			header: m.weekly_reports_detail_driver(),
			sortable: true,
			sizing: 'fixed',
			width: 200
		}),
		helper.number('parcelsStart', {
			header: m.weekly_reports_detail_parcels_start(),
			sortable: true,
			sizing: 'fixed',
			width: 100
		}),
		helper.number('parcelsDelivered', {
			header: m.weekly_reports_detail_parcels_delivered(),
			sortable: true,
			sizing: 'fixed',
			width: 110
		}),
		helper.number('parcelsReturned', {
			header: m.weekly_reports_detail_parcels_returned(),
			sortable: true,
			sizing: 'fixed',
			width: 110
		}),
		helper.number('exceptedReturns', {
			header: m.weekly_reports_detail_exceptions(),
			sortable: true,
			sizing: 'fixed',
			width: 110
		}),
		helper.text('exceptionNotes', {
			header: m.weekly_reports_detail_exception_notes(),
			sortable: false,
			sizing: 'fixed',
			width: 180
		}),
		helper.accessor('completedAt', (row) => row.completedAt, {
			header: m.weekly_reports_detail_completed(),
			sortable: true,
			sizing: 'fixed',
			width: 140
		})
	];

	const table = createSvelteTable<WeekShiftRecord>(() => ({
		data: shifts,
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
/>

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
</style>
