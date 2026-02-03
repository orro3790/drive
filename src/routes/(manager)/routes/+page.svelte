<!--
	Route Management Page

	Manager-only page for CRUD operations on routes.
	Uses DataTable with tabs/toolbar pattern matching Snapgrade design.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import {
		DataTable,
		createSvelteTable,
		getCoreRowModel,
		getSortedRowModel,
		createColumnHelper,
		type SortingState,
		type CellRendererContext
	} from '$lib/components/data-table';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Select from '$lib/components/Select.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import Filter from '$lib/components/icons/Filter.svelte';
	import Reset from '$lib/components/icons/Reset.svelte';
	import { routeStore, type RouteWithWarehouse } from '$lib/stores/routeStore.svelte';
	import { warehouseStore } from '$lib/stores/warehouseStore.svelte';
	import { routeCreateSchema, routeUpdateSchema, type RouteStatus } from '$lib/schemas/route';
	import type { SelectOption } from '$lib/schemas/ui/select';

	// State
	let showCreateModal = $state(false);
	let editingRoute = $state<RouteWithWarehouse | null>(null);
	let deleteConfirm = $state<{ route: RouteWithWarehouse; x: number; y: number } | null>(null);
	let showFilterDrawer = $state(false);

	// Form state
	let formName = $state('');
	let formWarehouseId = $state('');
	let formErrors = $state<{ name?: string[]; warehouseId?: string[] }>({});

	// Filter state
	let warehouseFilter = $state('');
	let statusFilter = $state<RouteStatus | ''>('');
	let dateFilter = $state('');

	// Table state
	let sorting = $state<SortingState>([]);

	const helper = createColumnHelper<RouteWithWarehouse>();

	const columns = [
		helper.text('name', {
			header: m.common_name(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('warehouseName', {
			header: m.route_warehouse_header(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.display({
			id: 'status',
			header: m.route_status_header(),
			width: 140
		}),
		helper.display({
			id: 'actions',
			header: m.common_actions(),
			width: 100
		})
	];

	const table = createSvelteTable<RouteWithWarehouse>(() => ({
		data: routeStore.routes,
		columns,
		state: {
			sorting
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	}));

	const statusLabels: Record<RouteStatus, string> = {
		assigned: m.route_status_assigned(),
		unfilled: m.route_status_unfilled(),
		bidding: m.route_status_bidding()
	};

	const statusChip: Record<RouteStatus, 'success' | 'warning' | 'info'> = {
		assigned: 'success',
		unfilled: 'warning',
		bidding: 'info'
	};

	const statusOptions: SelectOption[] = [
		{ value: '', label: m.route_filter_status_all() },
		{ value: 'assigned', label: statusLabels.assigned },
		{ value: 'unfilled', label: statusLabels.unfilled },
		{ value: 'bidding', label: statusLabels.bidding }
	];

	// Count active filters for badge display
	const activeFilterCount = $derived(
		[warehouseFilter, statusFilter, dateFilter].filter(Boolean).length
	);

	function toLocalYmd(date = new Date()) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function applyFilters() {
		routeStore.load({
			warehouseId: warehouseFilter || undefined,
			status: statusFilter || undefined,
			date: dateFilter || undefined
		});
	}

	function resetFilters() {
		warehouseFilter = '';
		statusFilter = '';
		dateFilter = toLocalYmd();
		applyFilters();
	}

	function openCreateModal() {
		formName = '';
		formWarehouseId = '';
		formErrors = {};
		showCreateModal = true;
	}

	function openEditModal(route: RouteWithWarehouse) {
		formName = route.name;
		formWarehouseId = route.warehouseId;
		formErrors = {};
		editingRoute = route;
	}

	function closeModals() {
		showCreateModal = false;
		editingRoute = null;
		formErrors = {};
	}

	function handleCreate() {
		const result = routeCreateSchema.safeParse({
			name: formName,
			warehouseId: formWarehouseId
		});
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		const warehouseName =
			warehouseStore.warehouses.find((warehouse) => warehouse.id === result.data.warehouseId)
				?.name ?? '';
		routeStore.create(result.data, warehouseName);
		closeModals();
	}

	function handleUpdate() {
		if (!editingRoute) return;

		const result = routeUpdateSchema.safeParse({
			name: formName,
			warehouseId: formWarehouseId
		});
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		const warehouseName =
			warehouseStore.warehouses.find((warehouse) => warehouse.id === result.data.warehouseId)
				?.name ?? editingRoute.warehouseName;
		routeStore.update(editingRoute.id, result.data, warehouseName);
		closeModals();
	}

	function openDeleteConfirm(route: RouteWithWarehouse, event: MouseEvent) {
		deleteConfirm = {
			route,
			x: event.clientX,
			y: event.clientY
		};
	}

	function handleDelete() {
		if (!deleteConfirm) return;
		routeStore.delete(deleteConfirm.route.id);
		deleteConfirm = null;
	}

	const warehouseOptions = $derived(
		warehouseStore.warehouses.map((warehouse) => ({
			value: warehouse.id,
			label: warehouse.name
		}))
	);

	const warehouseFilterOptions = $derived([
		{ value: '', label: m.route_filter_warehouse_all() },
		...warehouseOptions
	]);

	const warehouseFormOptions = $derived(warehouseOptions);

	// Load data on mount
	onMount(() => {
		warehouseStore.load();
		dateFilter = toLocalYmd();
		applyFilters();
	});
</script>

{#snippet statusCell(ctx: CellRendererContext<RouteWithWarehouse>)}
	<Chip
		variant="status"
		status={statusChip[ctx.row.status]}
		label={statusLabels[ctx.row.status]}
		size="xs"
	/>
{/snippet}

{#snippet actionsCell(ctx: CellRendererContext<RouteWithWarehouse>)}
	<div class="cell-actions">
		<IconButton onclick={() => openEditModal(ctx.row)} tooltip={m.common_edit()}>
			<Icon><Pencil /></Icon>
		</IconButton>
		<IconButton onclick={(e) => openDeleteConfirm(ctx.row, e)} tooltip={m.common_delete()}>
			<Icon><Trash /></Icon>
		</IconButton>
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button type="button" class="tab active" role="tab" aria-selected="true" tabindex="0">
			{m.route_page_title()}
		</button>
	</div>
{/snippet}

{#snippet toolbarSnippet()}
	<IconButton
		tooltip={m.table_filter_label()}
		onclick={() => (showFilterDrawer = true)}
		attention={activeFilterCount > 0}
	>
		<Icon><Filter /></Icon>
	</IconButton>

	<IconButton tooltip={m.route_create_button()} onclick={openCreateModal}>
		<Icon><Plus /></Icon>
	</IconButton>

	<IconButton tooltip={m.table_columns_reset_sizes()} onclick={resetFilters}>
		<Icon><Reset /></Icon>
	</IconButton>
{/snippet}

<svelte:head>
	<title>{m.route_page_title()} | Drive</title>
</svelte:head>

<DataTable
	{table}
	loading={routeStore.isLoading}
	emptyTitle={m.route_empty_state()}
	emptyMessage={m.route_empty_state_message()}
	showPagination={false}
	showColumnVisibility
	showExport
	exportFilename="routes"
	tabs={tabsSnippet}
	toolbar={toolbarSnippet}
	cellComponents={{
		status: statusCell,
		actions: actionsCell
	}}
/>

<!-- Filter Drawer -->
{#if showFilterDrawer}
	<Drawer title={m.table_filter_title()} onClose={() => (showFilterDrawer = false)}>
		<div class="filter-form">
			<div class="filter-field">
				<label for="route-warehouse-filter">{m.route_filter_warehouse_label()}</label>
				<Select
					id="route-warehouse-filter"
					options={warehouseFilterOptions}
					bind:value={warehouseFilter}
				/>
			</div>
			<div class="filter-field">
				<label for="route-status-filter">{m.route_filter_status_label()}</label>
				<Select id="route-status-filter" options={statusOptions} bind:value={statusFilter} />
			</div>
			<div class="filter-field">
				<label for="route-date-filter">{m.route_filter_date_label()}</label>
				<DatePicker
					id="route-date-filter"
					bind:value={dateFilter}
					placeholder={m.route_filter_date_placeholder()}
				/>
			</div>
			<div class="filter-actions">
				<Button variant="secondary" onclick={resetFilters} fill>
					{m.table_filter_clear_all()}
				</Button>
				<Button
					onclick={() => {
						applyFilters();
						showFilterDrawer = false;
					}}
					fill
				>
					{m.common_confirm()}
				</Button>
			</div>
		</div>
	</Drawer>
{/if}

<!-- Create Modal -->
{#if showCreateModal}
	<Modal title={m.route_create_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleCreate();
			}}
		>
			<div class="form-field">
				<label for="create-name">{m.route_name_label()}</label>
				<InlineEditor
					id="create-name"
					value={formName}
					onInput={(v) => (formName = v)}
					placeholder={m.route_name_placeholder()}
					required
				/>
				{#if formErrors.name}
					<p class="field-error">{formErrors.name[0]}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="create-warehouse">{m.route_warehouse_label()}</label>
				<Select
					id="create-warehouse"
					options={warehouseFormOptions}
					bind:value={formWarehouseId}
					placeholder={m.route_warehouse_placeholder()}
					errors={formErrors.warehouseId}
				/>
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeModals} fill>
					{m.common_cancel()}
				</Button>
				<Button type="submit" fill>
					{m.common_create()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Edit Modal -->
{#if editingRoute}
	<Modal title={m.route_edit_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleUpdate();
			}}
		>
			<div class="form-field">
				<label for="edit-name">{m.route_name_label()}</label>
				<InlineEditor
					id="edit-name"
					value={formName}
					onInput={(v) => (formName = v)}
					placeholder={m.route_name_placeholder()}
					required
				/>
				{#if formErrors.name}
					<p class="field-error">{formErrors.name[0]}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="edit-warehouse">{m.route_warehouse_label()}</label>
				<Select
					id="edit-warehouse"
					options={warehouseFormOptions}
					bind:value={formWarehouseId}
					placeholder={m.route_warehouse_placeholder()}
					errors={formErrors.warehouseId}
				/>
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeModals} fill>
					{m.common_cancel()}
				</Button>
				<Button type="submit" fill>
					{m.common_save()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Delete Confirmation -->
{#if deleteConfirm}
	<ConfirmationDialog
		x={deleteConfirm.x}
		y={deleteConfirm.y}
		title={m.route_delete_title()}
		description={m.route_delete_confirm()}
		confirmLabel={m.common_delete()}
		confirmVariant="danger"
		onConfirm={handleDelete}
		onCancel={() => (deleteConfirm = null)}
	/>
{/if}

<style>
	.cell-actions {
		display: flex;
		gap: var(--spacing-1);
	}

	/* Tab bar styling - matching Snapgrade pattern */
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

	/* Filter drawer form */
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

	/* Modal form */
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.form-field label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.field-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}
</style>
