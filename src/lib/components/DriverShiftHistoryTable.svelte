<!--
	Driver Shift History Table

	Displays a driver's completed and cancelled shift records in a DataTable.
	Fetches data from /api/drivers/[id]/shifts on mount.
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
	import Chip from '$lib/components/primitives/Chip.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import type { DriverShiftRecord } from '$lib/schemas/driverShiftHistory';

	type Props = {
		driverId: string;
		tabs?: Snippet;
		isWideMode?: boolean;
		onWideModeChange?: (value: boolean) => void;
	};

	let { driverId, tabs, isWideMode = false, onWideModeChange }: Props = $props();

	let shifts = $state<DriverShiftRecord[]>([]);
	let isLoading = $state(true);
	let sorting = $state<SortingState>([{ id: 'date', desc: true }]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	const helper = createColumnHelper<DriverShiftRecord>();

	const columns = [
		helper.text('date', {
			header: m.drivers_shift_history_header_date(),
			sortable: true,
			sizing: 'fixed',
			width: 120,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('routeName', {
			header: m.drivers_shift_history_header_route(),
			sortable: true,
			sizing: 'fixed',
			width: 200,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.text('warehouseName', {
			header: m.drivers_shift_history_header_warehouse(),
			sortable: true,
			sizing: 'fixed',
			width: 180
		}),
		helper.accessor('status', (row) => row.status, {
			header: m.drivers_shift_history_header_status(),
			sortable: true,
			sizing: 'fixed',
			width: 120
		}),
		helper.number('parcelsStart', {
			header: m.drivers_shift_history_header_parcels_start(),
			sortable: true,
			sizing: 'fixed',
			width: 100
		}),
		helper.number('parcelsDelivered', {
			header: m.drivers_shift_history_header_parcels_delivered(),
			sortable: true,
			sizing: 'fixed',
			width: 110
		}),
		helper.number('parcelsReturned', {
			header: m.drivers_shift_history_header_parcels_returned(),
			sortable: true,
			sizing: 'fixed',
			width: 110
		}),
		helper.number('exceptedReturns', {
			header: m.drivers_shift_history_header_exceptions(),
			sortable: true,
			sizing: 'fixed',
			width: 110
		}),
		helper.text('exceptionNotes', {
			header: m.drivers_shift_history_header_exception_notes(),
			sortable: false,
			sizing: 'fill',
			minWidth: 150
		}),
		helper.accessor('arrivedAt', (row) => row.arrivedAt, {
			header: m.drivers_shift_history_header_arrived(),
			sortable: true,
			sizing: 'fixed',
			width: 140
		}),
		helper.accessor('completedAt', (row) => row.completedAt, {
			header: m.drivers_shift_history_header_completed(),
			sortable: true,
			sizing: 'fixed',
			width: 140
		})
	];

	const table = createSvelteTable<DriverShiftRecord>(() => ({
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
			const res = await fetch(`/api/drivers/${driverId}/shifts`);
			if (!res.ok) throw new Error('Failed to load shift history');
			const data = await res.json();
			shifts = data.shifts;
		} catch {
			toastStore.error(m.drivers_shift_history_load_error());
		} finally {
			isLoading = false;
		}
	});
</script>

{#snippet statusCell(ctx: CellRendererContext<DriverShiftRecord>)}
	<Chip
		label={ctx.row.status === 'completed'
			? m.drivers_shift_history_status_completed()
			: m.drivers_shift_history_status_cancelled()}
		variant="status"
		status={ctx.row.status === 'completed' ? 'success' : 'warning'}
		size="xs"
	/>
{/snippet}

{#snippet arrivedCell(ctx: CellRendererContext<DriverShiftRecord>)}
	<span class="timestamp">{formatTimestamp(ctx.row.arrivedAt)}</span>
{/snippet}

{#snippet completedCell(ctx: CellRendererContext<DriverShiftRecord>)}
	<span class="timestamp">{formatTimestamp(ctx.row.completedAt)}</span>
{/snippet}

{#snippet notesCell(ctx: CellRendererContext<DriverShiftRecord>)}
	{#if ctx.row.exceptionNotes}
		<span class="notes" title={ctx.row.exceptionNotes}>{ctx.row.exceptionNotes}</span>
	{:else}
		<span class="empty-cell">&mdash;</span>
	{/if}
{/snippet}

<DataTable
	{table}
	loading={isLoading}
	emptyTitle={m.drivers_shift_history_empty()}
	emptyMessage={m.drivers_shift_history_empty_message()}
	showPagination
	showSelection={false}
	showColumnVisibility
	showExport
	showWideModeToggle
	cellComponents={{
		status: statusCell,
		arrivedAt: arrivedCell,
		completedAt: completedCell,
		exceptionNotes: notesCell
	}}
	{isWideMode}
	{onWideModeChange}
	stateStorageKey="driver-shifts-{driverId}"
	exportFilename="driver-shifts"
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
		max-width: 200px;
	}

	.empty-cell {
		color: var(--text-muted);
	}
</style>
