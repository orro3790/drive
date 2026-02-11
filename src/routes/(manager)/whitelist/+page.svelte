<!--
	Whitelist Management Page

	Manager-only page for managing signup approvals.
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
	import PageWithDetailPanel from '$lib/components/PageWithDetailPanel.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Chip, { type ChipStatus } from '$lib/components/primitives/Chip.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import Select from '$lib/components/Select.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';
	import Filter from '$lib/components/icons/Filter.svelte';
	import Reset from '$lib/components/icons/Reset.svelte';
	import {
		whitelistStore,
		type WhitelistEntry,
		type WhitelistResolvedStatus
	} from '$lib/stores/whitelistStore.svelte';
	import { onboardingCreateSchema } from '$lib/schemas/onboarding';
	import type { SelectOption } from '$lib/schemas/ui/select';

	// State
	let showCreateModal = $state(false);
	let showFilterDrawer = $state(false);
	let selectedEntryId = $state<string | null>(null);
	let revokeConfirm = $state<{ entry: WhitelistEntry; x: number; y: number } | null>(null);

	// Form state
	let formEmail = $state('');
	let formErrors = $state<{ email?: string[] }>({});

	// Filter state
	let emailFilter = $state('');
	let statusFilter = $state<string>('');

	// Table state
	let sorting = $state<SortingState>([]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	const dateFormatter = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	const statusFilterOptions: SelectOption[] = [
		{ value: '', label: m.whitelist_filter_status_all() },
		{ value: 'pending', label: m.whitelist_status_pending() },
		{ value: 'consumed', label: m.whitelist_status_consumed() },
		{ value: 'revoked', label: m.whitelist_status_revoked() },
		{ value: 'expired', label: m.whitelist_status_expired() }
	];

	function getStatusLabel(status: WhitelistResolvedStatus): string {
		switch (status) {
			case 'consumed':
				return m.whitelist_status_consumed();
			case 'revoked':
				return m.whitelist_status_revoked();
			case 'expired':
				return m.whitelist_status_expired();
			case 'reserved':
				return m.whitelist_status_reserved();
			default:
				return m.whitelist_status_pending();
		}
	}

	function getStatusTone(status: WhitelistResolvedStatus): ChipStatus {
		switch (status) {
			case 'consumed':
				return 'success';
			case 'revoked':
				return 'error';
			case 'expired':
				return 'warning';
			default:
				return 'neutral';
		}
	}

	function formatDate(date: Date | string | null): string {
		if (!date) return m.whitelist_detail_not_set();
		const d = new Date(date);
		if (Number.isNaN(d.getTime())) return m.whitelist_detail_not_set();
		return dateFormatter.format(d);
	}

	function isRevocable(entry: WhitelistEntry): boolean {
		return entry.resolvedStatus === 'pending' || entry.resolvedStatus === 'reserved';
	}

	// Column definitions
	const helper = createColumnHelper<WhitelistEntry>();

	const columns = [
		helper.text('email', {
			header: m.whitelist_header_email(),
			sortable: true,
			sizing: 'fixed',
			width: 320,
			minWidth: 220,
			stickyLeft: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.accessor('resolvedStatus', (row) => row.resolvedStatus, {
			header: m.whitelist_header_status(),
			sortable: true,
			sizing: 'fixed',
			width: 150,
			minWidth: 120,
			mobileVisible: true,
			mobilePriority: 2
		}),
		helper.accessor('createdByName', (row) => row.createdByName ?? '', {
			header: m.whitelist_header_created_by(),
			sortable: true,
			sizing: 'fixed',
			width: 200,
			minWidth: 160
		}),
		helper.accessor('createdAt', (row) => row.createdAt.getTime(), {
			header: m.whitelist_header_created_at(),
			sortable: true,
			sizing: 'fixed',
			width: 220,
			minWidth: 180
		})
	];

	// Filtered data
	const filteredData = $derived.by(() => {
		let data = whitelistStore.entries;
		if (emailFilter) {
			const lower = emailFilter.toLowerCase();
			data = data.filter((e) => e.email.toLowerCase().includes(lower));
		}
		if (statusFilter) {
			data = data.filter((e) => e.resolvedStatus === statusFilter);
		}
		return data;
	});

	const selectedEntry = $derived.by(
		() => whitelistStore.entries.find((e) => e.id === selectedEntryId) ?? null
	);

	// Create table instance
	const table = createSvelteTable<WhitelistEntry>(() => ({
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

	onMount(() => {
		whitelistStore.load();
	});

	function resetFilters() {
		emailFilter = '';
		statusFilter = '';
	}

	function openCreateModal() {
		formEmail = '';
		formErrors = {};
		showCreateModal = true;
	}

	function closeModals() {
		showCreateModal = false;
		formErrors = {};
	}

	function handleCreate() {
		const result = onboardingCreateSchema.safeParse({ kind: 'approval', email: formEmail });
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}

		whitelistStore.create(result.data.email);
		closeModals();
	}

	function syncSelectedEntry(entry: WhitelistEntry) {
		if (selectedEntryId === entry.id) return;
		selectedEntryId = entry.id;
	}

	function clearSelection() {
		selectedEntryId = null;
	}

	function handleRowClick(entry: WhitelistEntry, _event: MouseEvent) {
		syncSelectedEntry(entry);
	}

	function openRevokeConfirm(entry: WhitelistEntry, event: MouseEvent) {
		revokeConfirm = {
			entry,
			x: event.clientX,
			y: event.clientY
		};
	}

	function handleRevoke() {
		if (!revokeConfirm) return;
		whitelistStore.revoke(revokeConfirm.entry.id);
		revokeConfirm = null;
	}
</script>

{#snippet tabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button type="button" class="tab active" role="tab" aria-selected="true" tabindex="0">
			{m.whitelist_page_title()}
		</button>
	</div>
{/snippet}

{#snippet toolbarSnippet()}
	<IconButton tooltip={m.table_filter_label()} onclick={() => (showFilterDrawer = true)}>
		<Icon><Filter /></Icon>
	</IconButton>

	<IconButton tooltip={m.whitelist_create_button()} onclick={openCreateModal}>
		<Icon><Plus /></Icon>
	</IconButton>

	<IconButton tooltip={m.table_filter_reset()} onclick={resetFilters}>
		<Icon><Reset /></Icon>
	</IconButton>
{/snippet}

{#snippet statusCell(ctx: CellRendererContext<WhitelistEntry>)}
	<Chip
		variant="status"
		label={getStatusLabel(ctx.row.resolvedStatus)}
		status={getStatusTone(ctx.row.resolvedStatus)}
	/>
{/snippet}

{#snippet createdByNameCell(ctx: CellRendererContext<WhitelistEntry>)}
	<span class="created-by">{ctx.row.createdByName ?? m.whitelist_detail_not_set()}</span>
{/snippet}

{#snippet createdAtCell(ctx: CellRendererContext<WhitelistEntry>)}
	<span class="date-cell">{formatDate(ctx.row.createdAt)}</span>
{/snippet}

{#snippet entryDetailView(entry: WhitelistEntry)}
	<div class="detail-content">
		<dl class="detail-list">
			<div class="detail-row">
				<dt>{m.whitelist_detail_email()}</dt>
				<dd>{entry.email}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.whitelist_detail_status()}</dt>
				<dd>
					<Chip
						variant="status"
						label={getStatusLabel(entry.resolvedStatus)}
						status={getStatusTone(entry.resolvedStatus)}
					/>
				</dd>
			</div>
			<div class="detail-row">
				<dt>{m.whitelist_detail_created_by()}</dt>
				<dd>{entry.createdByName ?? m.whitelist_detail_not_set()}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.whitelist_detail_created_at()}</dt>
				<dd>{formatDate(entry.createdAt)}</dd>
			</div>
		</dl>
	</div>
{/snippet}

{#snippet entryDetailActions(entry: WhitelistEntry)}
	{#if isRevocable(entry)}
		<Button variant="secondary" size="small" fill onclick={(e) => openRevokeConfirm(entry, e)}>
			{m.whitelist_revoke_button()}
		</Button>
	{/if}
{/snippet}

{#snippet mobileDetail(entry: WhitelistEntry)}
	<div class="detail-content">
		<dl class="detail-list">
			<div class="detail-row">
				<dt>{m.whitelist_detail_email()}</dt>
				<dd>{entry.email}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.whitelist_detail_status()}</dt>
				<dd>
					<Chip
						variant="status"
						label={getStatusLabel(entry.resolvedStatus)}
						status={getStatusTone(entry.resolvedStatus)}
					/>
				</dd>
			</div>
			<div class="detail-row">
				<dt>{m.whitelist_detail_created_by()}</dt>
				<dd>{entry.createdByName ?? m.whitelist_detail_not_set()}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.whitelist_detail_created_at()}</dt>
				<dd>{formatDate(entry.createdAt)}</dd>
			</div>
		</dl>

		<div class="detail-actions">
			{#if isRevocable(entry)}
				<Button variant="secondary" fill onclick={(e) => openRevokeConfirm(entry, e)}>
					{m.whitelist_revoke_button()}
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
		loading={whitelistStore.isLoading}
		emptyTitle={m.whitelist_empty_state()}
		emptyMessage={m.whitelist_empty_state_message()}
		showPagination
		showSelection={false}
		showColumnVisibility
		showExport
		showWideModeToggle
		isWideMode={ctx.isWideMode}
		onWideModeChange={ctx.onWideModeChange}
		onMobileDetailOpen={syncSelectedEntry}
		stateStorageKey="whitelist"
		exportFilename="whitelist"
		tabs={tabsSnippet}
		toolbar={toolbarSnippet}
		cellComponents={{
			resolvedStatus: statusCell,
			createdByName: createdByNameCell,
			createdAt: createdAtCell
		}}
		activeRowId={selectedEntryId ?? undefined}
		onRowClick={handleRowClick}
		mobileDetailContent={mobileDetail}
		mobileDetailTitle={m.whitelist_page_title()}
	/>
{/snippet}

<svelte:head>
	<title>{m.whitelist_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<PageWithDetailPanel
		item={selectedEntry}
		title={m.whitelist_page_title()}
		open={!!selectedEntry}
		onClose={clearSelection}
		isEditing={false}
		hasChanges={false}
		onEditToggle={undefined}
		onSave={undefined}
		viewContent={entryDetailView}
		viewActions={selectedEntry && isRevocable(selectedEntry) ? entryDetailActions : undefined}
		showDefaultViewEditAction={false}
		{tableContent}
		storageKey="whitelist"
	/>
</div>

<!-- Filter Drawer -->
{#if showFilterDrawer}
	<Drawer title={m.table_filter_title()} onClose={() => (showFilterDrawer = false)}>
		<div class="filter-form">
			<div class="filter-field">
				<label for="whitelist-email-filter">{m.whitelist_filter_email_label()}</label>
				<InlineEditor
					id="whitelist-email-filter"
					value={emailFilter}
					onInput={(v) => (emailFilter = v)}
					placeholder={m.whitelist_filter_email_placeholder()}
				/>
			</div>
			<div class="filter-field">
				<label>{m.whitelist_filter_status_label()}</label>
				<Select
					options={statusFilterOptions}
					value={statusFilter}
					onChange={(v) => (statusFilter = String(v))}
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
	<Modal title={m.whitelist_create_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleCreate();
			}}
		>
			<div class="form-field">
				<label for="create-email">{m.whitelist_email_label()}</label>
				<InlineEditor
					id="create-email"
					value={formEmail}
					onInput={(v) => (formEmail = v)}
					placeholder={m.whitelist_email_placeholder()}
					inputType="email"
					required
				/>
				{#if formErrors.email}
					<p class="field-error">{formErrors.email[0]}</p>
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

<!-- Revoke Confirmation -->
{#if revokeConfirm}
	<ConfirmationDialog
		x={revokeConfirm.x}
		y={revokeConfirm.y}
		title={m.whitelist_revoke_title()}
		description={m.whitelist_revoke_confirm()}
		confirmLabel={m.whitelist_revoke_button()}
		confirmVariant="danger"
		onConfirm={handleRevoke}
		onCancel={() => (revokeConfirm = null)}
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

	.created-by {
		color: var(--text-normal);
		font-size: var(--font-size-sm);
	}

	.date-cell {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
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
