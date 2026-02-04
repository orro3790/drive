<!--
	Warehouse Management Page

	Manager-only page for CRUD operations on warehouses.
	Uses DataTable with Drive tabs/toolbar pattern.
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
	import Modal from '$lib/components/primitives/Modal.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import Filter from '$lib/components/icons/Filter.svelte';
	import Reset from '$lib/components/icons/Reset.svelte';
	import { warehouseStore, type WarehouseWithRouteCount } from '$lib/stores/warehouseStore.svelte';
	import { warehouseCreateSchema, warehouseUpdateSchema } from '$lib/schemas/warehouse';

	// State
	let showCreateModal = $state(false);
	let showFilterDrawer = $state(false);
	let editingWarehouse = $state<WarehouseWithRouteCount | null>(null);
	let deleteConfirm = $state<{ warehouse: WarehouseWithRouteCount; x: number; y: number } | null>(
		null
	);

	// Form state
	let formName = $state('');
	let formAddress = $state('');
	let formErrors = $state<{ name?: string[]; address?: string[] }>({});

	// Filter state
	let nameFilter = $state('');

	// Table state
	let sorting = $state<SortingState>([]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	// Column definitions
	const helper = createColumnHelper<WarehouseWithRouteCount>();

	const columns = [
		helper.text('name', {
			header: m.common_name(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('address', {
			header: m.common_address(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.number('routeCount', {
			header: m.warehouse_routes_header(),
			sortable: true,
			width: 100
		}),
		helper.display({
			id: 'actions',
			header: m.common_actions(),
			width: 100
		})
	];

	// Filtered data
	const filteredData = $derived(
		nameFilter
			? warehouseStore.warehouses.filter((w) =>
					w.name.toLowerCase().includes(nameFilter.toLowerCase())
				)
			: warehouseStore.warehouses
	);

	// Create table instance
	const table = createSvelteTable<WarehouseWithRouteCount>(() => ({
		data: filteredData,
		columns,
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

	// Load data on mount
	onMount(() => {
		warehouseStore.load();
	});

	function resetFilters() {
		nameFilter = '';
	}

	// Form handlers
	function openCreateModal() {
		formName = '';
		formAddress = '';
		formErrors = {};
		showCreateModal = true;
	}

	function openEditModal(warehouse: WarehouseWithRouteCount) {
		formName = warehouse.name;
		formAddress = warehouse.address;
		formErrors = {};
		editingWarehouse = warehouse;
	}

	function closeModals() {
		showCreateModal = false;
		editingWarehouse = null;
		formErrors = {};
	}

	function handleCreate() {
		const result = warehouseCreateSchema.safeParse({ name: formName, address: formAddress });
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		warehouseStore.create(result.data);
		closeModals();
	}

	function handleUpdate() {
		if (!editingWarehouse) return;

		const result = warehouseUpdateSchema.safeParse({ name: formName, address: formAddress });
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		warehouseStore.update(editingWarehouse.id, result.data);
		closeModals();
	}

	function openDeleteConfirm(warehouse: WarehouseWithRouteCount, event: MouseEvent) {
		deleteConfirm = {
			warehouse,
			x: event.clientX,
			y: event.clientY
		};
	}

	function handleDelete() {
		if (!deleteConfirm) return;
		warehouseStore.delete(deleteConfirm.warehouse.id);
		deleteConfirm = null;
	}
</script>

{#snippet actionsCell(ctx: CellRendererContext<WarehouseWithRouteCount>)}
	<div class="cell-actions">
		<IconButton onclick={() => openEditModal(ctx.row)} tooltip={m.common_edit()}>
			<Icon><Pencil /></Icon>
		</IconButton>
		<IconButton
			onclick={(e) => openDeleteConfirm(ctx.row, e)}
			tooltip={m.common_delete()}
			disabled={ctx.row.routeCount > 0}
		>
			<Icon><Trash /></Icon>
		</IconButton>
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button type="button" class="tab active" role="tab" aria-selected="true" tabindex="0">
			{m.warehouse_page_title()}
		</button>
	</div>
{/snippet}

{#snippet toolbarSnippet()}
	<IconButton tooltip={m.table_filter_label()} onclick={() => (showFilterDrawer = true)}>
		<Icon><Filter /></Icon>
	</IconButton>

	<IconButton tooltip={m.warehouse_create_button()} onclick={openCreateModal}>
		<Icon><Plus /></Icon>
	</IconButton>

	<IconButton tooltip={m.table_columns_reset_sizes()} onclick={resetFilters}>
		<Icon><Reset /></Icon>
	</IconButton>
{/snippet}

<svelte:head>
	<title>{m.warehouse_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<DataTable
		{table}
		loading={warehouseStore.isLoading}
		emptyTitle={m.warehouse_empty_state()}
		emptyMessage={m.warehouse_empty_state_message()}
		showPagination
		showColumnVisibility
		showExport
		exportFilename="warehouses"
		tabs={tabsSnippet}
		toolbar={toolbarSnippet}
		cellComponents={{
			actions: actionsCell
		}}
	/>
</div>

<!-- Filter Drawer -->
{#if showFilterDrawer}
	<Drawer title={m.table_filter_title()} onClose={() => (showFilterDrawer = false)}>
		<div class="filter-form">
			<div class="filter-field">
				<label for="warehouse-name-filter">{m.warehouse_filter_name_label()}</label>
				<InlineEditor
					id="warehouse-name-filter"
					value={nameFilter}
					onInput={(v) => (nameFilter = v)}
					placeholder={m.warehouse_filter_name_placeholder()}
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

<!-- Create Modal -->
{#if showCreateModal}
	<Modal title={m.warehouse_create_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleCreate();
			}}
		>
			<div class="form-field">
				<label for="create-name">{m.warehouse_name_label()}</label>
				<InlineEditor
					id="create-name"
					value={formName}
					onInput={(v) => (formName = v)}
					placeholder={m.warehouse_name_placeholder()}
					required
				/>
				{#if formErrors.name}
					<p class="field-error">{formErrors.name[0]}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="create-address">{m.warehouse_address_label()}</label>
				<InlineEditor
					id="create-address"
					value={formAddress}
					onInput={(v) => (formAddress = v)}
					placeholder={m.warehouse_address_placeholder()}
					required
				/>
				{#if formErrors.address}
					<p class="field-error">{formErrors.address[0]}</p>
				{/if}
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
{#if editingWarehouse}
	<Modal title={m.warehouse_edit_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleUpdate();
			}}
		>
			<div class="form-field">
				<label for="edit-name">{m.warehouse_name_label()}</label>
				<InlineEditor
					id="edit-name"
					value={formName}
					onInput={(v) => (formName = v)}
					placeholder={m.warehouse_name_placeholder()}
					required
				/>
				{#if formErrors.name}
					<p class="field-error">{formErrors.name[0]}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="edit-address">{m.warehouse_address_label()}</label>
				<InlineEditor
					id="edit-address"
					value={formAddress}
					onInput={(v) => (formAddress = v)}
					placeholder={m.warehouse_address_placeholder()}
					required
				/>
				{#if formErrors.address}
					<p class="field-error">{formErrors.address[0]}</p>
				{/if}
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
		title={m.warehouse_delete_title()}
		description={m.warehouse_delete_confirm()}
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

	/* Tab bar styling - matching Drive pattern */
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
