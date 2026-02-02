<!--
	Route Management Page

	Manager-only page for CRUD operations on routes.
	Uses DataTable with optimistic updates via routeStore.
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
	import Button from '$lib/components/primitives/Button.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Select from '$lib/components/Select.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import { routeStore, type RouteWithWarehouse } from '$lib/stores/routeStore.svelte';
	import { warehouseStore } from '$lib/stores/warehouseStore.svelte';
	import { routeCreateSchema, routeUpdateSchema, type RouteStatus } from '$lib/schemas/route';
	import type { SelectOption } from '$lib/schemas/ui/select';

	// State
	let showCreateModal = $state(false);
	let editingRoute = $state<RouteWithWarehouse | null>(null);
	let deleteConfirm = $state<{ route: RouteWithWarehouse; x: number; y: number } | null>(null);

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

<svelte:head>
	<title>{m.route_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.route_page_title()}</h1>
				<p>{m.route_page_description()}</p>
			</div>
			<Button onclick={openCreateModal}>
				<Icon><Plus /></Icon>
				{m.route_create_button()}
			</Button>
		</div>

		<div class="filters">
			<div class="filter-field">
				<label for="route-warehouse-filter">{m.route_filter_warehouse_label()}</label>
				<Select
					id="route-warehouse-filter"
					options={warehouseFilterOptions}
					bind:value={warehouseFilter}
					onChange={applyFilters}
				/>
			</div>
			<div class="filter-field">
				<label for="route-status-filter">{m.route_filter_status_label()}</label>
				<Select
					id="route-status-filter"
					options={statusOptions}
					bind:value={statusFilter}
					onChange={applyFilters}
				/>
			</div>
			<div class="filter-field">
				<label for="route-date-filter">{m.route_filter_date_label()}</label>
				<DatePicker
					id="route-date-filter"
					bind:value={dateFilter}
					placeholder={m.route_filter_date_placeholder()}
					onchange={applyFilters}
				/>
			</div>
		</div>

		<div class="page-content">
			<DataTable
				{table}
				loading={routeStore.isLoading}
				emptyTitle={m.route_empty_state()}
				emptyMessage={m.route_empty_state_message()}
				showPagination={false}
				cellComponents={{
					status: statusCell,
					actions: actionsCell
				}}
			/>
		</div>
	</div>
</div>

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
	.page-surface {
		min-height: 100vh;
		background: var(--surface-secondary);
	}

	.page-stage {
		max-width: 1200px;
		margin: 0 auto;
		padding: var(--spacing-4);
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-4);
		margin-bottom: var(--spacing-4);
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

	.filters {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-4);
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

	.page-content {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.cell-actions {
		display: flex;
		gap: var(--spacing-1);
	}

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

	@media (max-width: 900px) {
		.filters {
			grid-template-columns: 1fr;
		}
	}
</style>
