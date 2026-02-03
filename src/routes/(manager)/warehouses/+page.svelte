<!--
	Warehouse Management Page

	Manager-only page for CRUD operations on warehouses.
	Uses DataTable with optimistic updates via warehouseStore.
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
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import Trash from '$lib/components/icons/Trash.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import { warehouseStore, type WarehouseWithRouteCount } from '$lib/stores/warehouseStore.svelte';
	import { warehouseCreateSchema, warehouseUpdateSchema } from '$lib/schemas/warehouse';

	// State
	let showCreateModal = $state(false);
	let editingWarehouse = $state<WarehouseWithRouteCount | null>(null);
	let deleteConfirm = $state<{ warehouse: WarehouseWithRouteCount; x: number; y: number } | null>(
		null
	);

	// Form state
	let formName = $state('');
	let formAddress = $state('');
	let formErrors = $state<{ name?: string[]; address?: string[] }>({});

	// Table state
	let sorting = $state<SortingState>([]);

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
			header: 'Routes',
			sortable: true,
			width: 100
		}),
		helper.display({
			id: 'actions',
			header: m.common_actions(),
			width: 100
		})
	];

	// Create table instance
	const table = createSvelteTable<WarehouseWithRouteCount>(() => ({
		data: warehouseStore.warehouses,
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

	// Load data on mount
	onMount(() => {
		warehouseStore.load();
	});

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

<svelte:head>
	<title>{m.warehouse_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.warehouse_page_title()}</h1>
				<p>{m.warehouse_page_description()}</p>
			</div>
			<Button onclick={openCreateModal}>
				<Icon><Plus /></Icon>
				{m.warehouse_create_button()}
			</Button>
		</div>

		<div class="page-content">
			<DataTable
				{table}
				loading={warehouseStore.isLoading}
				emptyTitle={m.warehouse_empty_state()}
				emptyMessage={m.warehouse_empty_state_message()}
				showPagination={false}
				cellComponents={{
					actions: actionsCell
				}}
			/>
		</div>
	</div>
</div>

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
	.page-surface {
		min-height: 100vh;
		background: var(--surface-inset);
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
</style>
