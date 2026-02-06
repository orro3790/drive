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
		type PaginationState
	} from '$lib/components/data-table';
	import PageWithDetailPanel from '$lib/components/PageWithDetailPanel.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import Filter from '$lib/components/icons/Filter.svelte';
	import Reset from '$lib/components/icons/Reset.svelte';
	import { warehouseStore, type WarehouseWithRouteCount } from '$lib/stores/warehouseStore.svelte';
	import { warehouseCreateSchema, warehouseUpdateSchema } from '$lib/schemas/warehouse';

	// State
	let showCreateModal = $state(false);
	let showFilterDrawer = $state(false);
	let selectedWarehouseId = $state<string | null>(null);
	let isEditing = $state(false);
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
			sizing: 'fixed',
			width: 320,
			minWidth: 220,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('address', {
			header: m.common_address(),
			sortable: true,
			sizing: 'fixed',
			width: 430,
			minWidth: 300,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.number('routeCount', {
			header: m.warehouse_routes_header(),
			sortable: true,
			sizing: 'fixed',
			width: 180
		}),
		helper.number('assignedDriversNext7', {
			header: m.warehouse_header_assigned_drivers(),
			sortable: true,
			sizing: 'fixed',
			width: 160
		}),
		helper.number('unfilledRoutesNext7', {
			header: m.warehouse_header_unfilled_routes(),
			sortable: true,
			sizing: 'fixed',
			width: 160
		}),
		helper.number('openBidWindows', {
			header: m.warehouse_header_open_bid_windows(),
			sortable: true,
			sizing: 'fixed',
			width: 150
		}),
		helper.number('managerCount', {
			header: m.warehouse_header_manager_count(),
			sortable: true,
			sizing: 'fixed',
			width: 120
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

	const selectedWarehouse = $derived.by(
		() =>
			warehouseStore.warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ?? null
	);
	const hasChanges = $derived(
		!!selectedWarehouse &&
			(formName !== selectedWarehouse.name || formAddress !== selectedWarehouse.address)
	);

	// Create table instance
	const table = createSvelteTable<WarehouseWithRouteCount>(() => ({
		data: filteredData,
		columns,
		getRowId: (row) => row.id,
		state: {
			sorting,
			pagination
		},
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

	function syncSelectedWarehouse(warehouse: WarehouseWithRouteCount) {
		if (selectedWarehouseId === warehouse.id) return;
		selectedWarehouseId = warehouse.id;
		formName = warehouse.name;
		formAddress = warehouse.address;
		formErrors = {};
		isEditing = false;
	}

	function clearSelection() {
		selectedWarehouseId = null;
		formErrors = {};
		isEditing = false;
	}

	function startEditing(warehouse: WarehouseWithRouteCount) {
		if (selectedWarehouseId !== warehouse.id) {
			selectedWarehouseId = warehouse.id;
		}
		formName = warehouse.name;
		formAddress = warehouse.address;
		formErrors = {};
		isEditing = true;
	}

	function cancelEditing() {
		if (selectedWarehouse) {
			formName = selectedWarehouse.name;
			formAddress = selectedWarehouse.address;
		}
		formErrors = {};
		isEditing = false;
	}

	function handleEditToggle(editing: boolean) {
		if (!selectedWarehouse) return;
		if (editing) {
			startEditing(selectedWarehouse);
			return;
		}
		cancelEditing();
	}

	function closeModals() {
		showCreateModal = false;
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

	function handleSave() {
		if (!selectedWarehouse) return;

		const result = warehouseUpdateSchema.safeParse({ name: formName, address: formAddress });
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		warehouseStore.update(selectedWarehouse.id, result.data);
		formErrors = {};
		isEditing = false;
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

	function handleRowClick(warehouse: WarehouseWithRouteCount, _event: MouseEvent) {
		syncSelectedWarehouse(warehouse);
	}
</script>

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

{#snippet warehouseDetailInfo(warehouse: WarehouseWithRouteCount)}
	<dl class="detail-list">
		<div class="detail-row">
			<dt>{m.common_name()}</dt>
			<dd>{warehouse.name}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.common_address()}</dt>
			<dd>{warehouse.address}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.warehouse_routes_header()}</dt>
			<dd>{warehouse.routeCount}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.warehouse_detail_assigned_drivers()}</dt>
			<dd>{warehouse.assignedDriversNext7}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.warehouse_detail_unfilled_routes()}</dt>
			<dd>{warehouse.unfilledRoutesNext7}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.warehouse_detail_open_bid_windows()}</dt>
			<dd>{warehouse.openBidWindows}</dd>
		</div>
		<div class="detail-row">
			<dt>{m.warehouse_detail_manager_count()}</dt>
			<dd>{warehouse.managerCount}</dd>
		</div>
	</dl>
{/snippet}

{#snippet warehouseDetailView(warehouse: WarehouseWithRouteCount)}
	<div class="detail-content">
		{@render warehouseDetailInfo(warehouse)}
	</div>
{/snippet}

{#snippet warehouseDetailEditFields(warehouse: WarehouseWithRouteCount)}
	<div class="form-field">
		<label for="warehouse-edit-name">{m.warehouse_name_label()}</label>
		<InlineEditor
			id="warehouse-edit-name"
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
		<label for="warehouse-edit-address">{m.warehouse_address_label()}</label>
		<InlineEditor
			id="warehouse-edit-address"
			value={formAddress}
			onInput={(v) => (formAddress = v)}
			placeholder={m.warehouse_address_placeholder()}
			required
		/>
		{#if formErrors.address}
			<p class="field-error">{formErrors.address[0]}</p>
		{/if}
	</div>
{/snippet}

{#snippet warehouseDetailEdit(warehouse: WarehouseWithRouteCount)}
	<div class="detail-content">
		{@render warehouseDetailEditFields(warehouse)}
	</div>
{/snippet}

{#snippet warehouseDetailActions(warehouse: WarehouseWithRouteCount)}
	<Button
		variant="secondary"
		size="small"
		fill
		onclick={(e) => openDeleteConfirm(warehouse, e)}
		disabled={warehouse.routeCount > 0}
	>
		{m.common_delete()}
	</Button>
{/snippet}

{#snippet mobileDetail(warehouse: WarehouseWithRouteCount)}
	<div class="detail-content">
		{#if isEditing}
			{@render warehouseDetailEditFields(warehouse)}
		{:else}
			{@render warehouseDetailInfo(warehouse)}
		{/if}

		<div class="detail-actions">
			{#if isEditing}
				<Button variant="secondary" fill onclick={cancelEditing}>
					{m.common_cancel()}
				</Button>
				<Button fill disabled={!hasChanges} onclick={handleSave}>
					{m.common_save()}
				</Button>
			{:else}
				<Button fill onclick={() => startEditing(warehouse)}>
					{m.common_edit()}
				</Button>
				<Button
					variant="secondary"
					size="small"
					fill
					onclick={(e) => openDeleteConfirm(warehouse, e)}
					disabled={warehouse.routeCount > 0}
				>
					{m.common_delete()}
				</Button>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet tableContent(ctx: {
	isWideMode: boolean;
	onWideModeChange: (value: boolean) => void;
	isMobile: boolean;
})}
	<DataTable
		{table}
		loading={warehouseStore.isLoading}
		emptyTitle={m.warehouse_empty_state()}
		emptyMessage={m.warehouse_empty_state_message()}
		showPagination
		showSelection={false}
		showColumnVisibility
		showExport
		showWideModeToggle
		isWideMode={ctx.isWideMode}
		onWideModeChange={ctx.onWideModeChange}
		onMobileDetailOpen={syncSelectedWarehouse}
		exportFilename="warehouses"
		tabs={tabsSnippet}
		toolbar={toolbarSnippet}
		activeRowId={selectedWarehouseId ?? undefined}
		onRowClick={handleRowClick}
		mobileDetailContent={mobileDetail}
		mobileDetailTitle={m.warehouse_page_title()}
	/>
{/snippet}

<svelte:head>
	<title>{m.warehouse_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<PageWithDetailPanel
		item={selectedWarehouse}
		title={m.warehouse_page_title()}
		open={!!selectedWarehouse}
		onClose={clearSelection}
		{isEditing}
		{hasChanges}
		onEditToggle={handleEditToggle}
		onSave={handleSave}
		viewContent={warehouseDetailView}
		editContent={warehouseDetailEdit}
		viewActions={warehouseDetailActions}
		{tableContent}
		storageKey="warehouses"
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

	/* Detail panel */
	.detail-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.detail-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin: 0;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-3) 0;
		border-bottom: var(--border-width-thin) solid var(--border-primary);
		min-height: 44px;
	}

	.detail-row:last-child {
		border-bottom: none;
	}

	.detail-row dt {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.detail-row dd {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
	}

	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
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
