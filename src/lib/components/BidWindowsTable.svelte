<!--
	Bid Windows Table

	Displays bid windows for manager dashboard with:
	- Route, Warehouse, Date, Status (countdown), Bids, Winner columns
	- Empty state when no windows
	- Detail panel shows bid window details when selected
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
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
	import { bidWindowStore, type BidWindow } from '$lib/stores/bidWindowStore.svelte';

	type Props = {
		onRowClick?: (window: BidWindow, event: MouseEvent) => void;
		activeRowId?: string | null;
		isWideMode?: boolean;
		onWideModeChange?: (value: boolean) => void;
		mobileDetailContent?: import('svelte').Snippet<[BidWindow]>;
		onMobileDetailOpen?: (window: BidWindow) => void;
		tabs?: import('svelte').Snippet;
		toolbar?: import('svelte').Snippet;
	};

	let {
		onRowClick,
		activeRowId = null,
		isWideMode = false,
		onWideModeChange,
		mobileDetailContent,
		onMobileDetailOpen,
		tabs,
		toolbar
	}: Props = $props();

	// Table state
	let sorting = $state<SortingState>([]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	const helper = createColumnHelper<BidWindow>();

	const columns = [
		helper.text('routeName', {
			header: m.bid_windows_header_route(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('warehouseName', {
			header: m.bid_windows_header_warehouse(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.text('assignmentDate', {
			header: m.bid_windows_header_date(),
			sortable: true,
			width: 120
		}),
		helper.display({
			id: 'status',
			header: m.bid_windows_header_status(),
			width: 140
		}),
		helper.number('bidCount', {
			header: m.bid_windows_header_bids(),
			width: 80
		}),
		helper.display({
			id: 'winner',
			header: m.bid_windows_header_winner(),
			width: 160
		})
	];

	const table = createSvelteTable<BidWindow>(() => ({
		data: bidWindowStore.bidWindows,
		columns,
		getRowId: (row) => row.id,
		state: {
			sorting,
			pagination
		},
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

	function formatDate(dateStr: string) {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatCountdown(closesAt: string) {
		const date = new Date(closesAt);
		const now = new Date();
		const diffMs = date.getTime() - now.getTime();
		const diffMins = Math.round(diffMs / 60000);

		if (diffMins < 0) return m.bid_windows_status_closed();

		if (diffMins < 60) {
			return m.bid_windows_countdown_minutes({ count: diffMins });
		} else {
			const diffHours = Math.round(diffMins / 60);
			if (diffHours < 24) {
				return m.bid_windows_countdown_hours({ count: diffHours });
			} else {
				const diffDays = Math.round(diffHours / 24);
				return m.bid_windows_countdown_days({ count: diffDays });
			}
		}
	}
</script>

{#snippet statusCell(ctx: CellRendererContext<BidWindow>)}
	{#if ctx.row.status === 'open'}
		<Chip variant="status" status="info" label={formatCountdown(ctx.row.closesAt)} size="xs" />
	{:else}
		<Chip variant="status" status="neutral" label={m.bid_windows_status_resolved()} size="xs" />
	{/if}
{/snippet}

{#snippet winnerCell(ctx: CellRendererContext<BidWindow>)}
	{#if ctx.row.status === 'resolved'}
		{#if ctx.row.winnerName}
			<span class="winner-name">{ctx.row.winnerName}</span>
		{:else}
			<span class="winner-unfilled">{m.bid_windows_winner_unfilled()}</span>
		{/if}
	{:else}
		<span class="winner-pending">—</span>
	{/if}
{/snippet}

<DataTable
	{table}
	loading={bidWindowStore.isLoading}
	emptyTitle={m.bid_windows_empty_title()}
	emptyMessage={m.bid_windows_empty_message()}
	showPagination
	showSelection={false}
	showColumnVisibility
	showExport
	showWideModeToggle
	{isWideMode}
	onWideModeChange={(value) => onWideModeChange?.(value)}
	exportFilename="bid-windows"
	{tabs}
	{toolbar}
	cellComponents={{
		status: statusCell,
		winner: winnerCell
	}}
	activeRowId={activeRowId ?? undefined}
	{onRowClick}
	{mobileDetailContent}
	mobileDetailTitle={m.bid_windows_detail_title()}
	{onMobileDetailOpen}
/>

<style>
	.winner-name {
		color: var(--text-normal);
	}

	.winner-unfilled {
		color: var(--status-warning);
		font-style: italic;
	}

	.winner-pending {
		color: var(--text-muted);
	}
</style>
