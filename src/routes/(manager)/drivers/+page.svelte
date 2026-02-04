<!--
	Driver Management Page (Manager Dashboard)

	Displays all drivers with their metrics and flag status.
	Allows managers to:
	- View driver metrics (attendance, completion rates)
	- Adjust weekly cap (1-6)
	- Unflag drivers

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
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Select from '$lib/components/Select.svelte';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import ShieldMinus from '$lib/components/icons/ShieldMinus.svelte';
	import { driverStore } from '$lib/stores/driverStore.svelte';
	import type { Driver } from '$lib/schemas/driver';
	import type { SelectOption } from '$lib/schemas/ui/select';

	// State
	let editingDriver = $state<Driver | null>(null);
	let unflagConfirm = $state<{ driver: Driver; x: number; y: number } | null>(null);

	// Form state
	let formWeeklyCap = $state(4);

	// Table state
	let sorting = $state<SortingState>([]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 20 });

	const helper = createColumnHelper<Driver>();

	const columns = [
		helper.text('name', {
			header: m.common_name(),
			sortable: true,
			mobileVisible: true,
			mobilePriority: 1
		}),
		helper.text('email', {
			header: m.drivers_header_email(),
			sortable: true,
			mobileVisible: false
		}),
		helper.display({
			id: 'phone',
			header: m.drivers_header_phone(),
			width: 140
		}),
		helper.display({
			id: 'attendance',
			header: m.drivers_header_attendance(),
			width: 100
		}),
		helper.display({
			id: 'completion',
			header: m.drivers_header_completion(),
			width: 100
		}),
		helper.display({
			id: 'weeklyCap',
			header: m.drivers_header_weekly_cap(),
			width: 100
		}),
		helper.display({
			id: 'flagStatus',
			header: m.drivers_header_flag_status(),
			width: 120
		}),
		helper.display({
			id: 'actions',
			header: m.common_actions(),
			width: 100
		})
	];

	const table = createSvelteTable<Driver>(() => ({
		data: driverStore.drivers,
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

	const weeklyCapOptions: SelectOption[] = [
		{ value: '1', label: '1 day' },
		{ value: '2', label: '2 days' },
		{ value: '3', label: '3 days' },
		{ value: '4', label: '4 days' },
		{ value: '5', label: '5 days' },
		{ value: '6', label: '6 days' }
	];

	function formatPercent(rate: number) {
		return `${Math.round(rate * 100)}%`;
	}

	function formatDate(date: Date | string | null) {
		if (!date) return '';
		const d = new Date(date);
		return d.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		});
	}

	function openEditModal(driver: Driver) {
		formWeeklyCap = driver.weeklyCap;
		editingDriver = driver;
	}

	function closeModals() {
		editingDriver = null;
	}

	function handleUpdate() {
		if (!editingDriver) return;
		driverStore.updateCap(editingDriver.id, formWeeklyCap);
		closeModals();
	}

	function openUnflagConfirm(driver: Driver, event: MouseEvent) {
		unflagConfirm = {
			driver,
			x: event.clientX,
			y: event.clientY
		};
	}

	function handleUnflag() {
		if (!unflagConfirm) return;
		driverStore.unflag(unflagConfirm.driver.id);
		unflagConfirm = null;
	}

	// Load data on mount
	onMount(() => {
		driverStore.load();
	});
</script>

{#snippet phoneCell(ctx: CellRendererContext<Driver>)}
	{#if ctx.row.phone}
		<span class="phone">{ctx.row.phone}</span>
	{:else}
		<span class="no-phone">{m.drivers_detail_no_phone()}</span>
	{/if}
{/snippet}

{#snippet attendanceCell(ctx: CellRendererContext<Driver>)}
	<span class="metric" class:low={ctx.row.attendanceRate < 0.7}>
		{formatPercent(ctx.row.attendanceRate)}
	</span>
{/snippet}

{#snippet completionCell(ctx: CellRendererContext<Driver>)}
	<span class="metric" class:low={ctx.row.completionRate < 0.7}>
		{formatPercent(ctx.row.completionRate)}
	</span>
{/snippet}

{#snippet weeklyCapCell(ctx: CellRendererContext<Driver>)}
	<span class="weekly-cap">{ctx.row.weeklyCap} days</span>
{/snippet}

{#snippet flagStatusCell(ctx: CellRendererContext<Driver>)}
	{#if ctx.row.isFlagged}
		<Chip variant="status" status="error" label={m.drivers_flag_flagged()} size="xs" />
	{:else if ctx.row.flagWarningDate}
		<Chip variant="status" status="warning" label={m.drivers_flag_warning()} size="xs" />
	{:else}
		<Chip variant="status" status="success" label={m.drivers_flag_good()} size="xs" />
	{/if}
{/snippet}

{#snippet actionsCell(ctx: CellRendererContext<Driver>)}
	<div class="cell-actions">
		<IconButton onclick={() => openEditModal(ctx.row)} tooltip={m.common_edit()}>
			<Icon><Pencil /></Icon>
		</IconButton>
		{#if ctx.row.isFlagged}
			<IconButton
				onclick={(e) => openUnflagConfirm(ctx.row, e)}
				tooltip={m.drivers_unflag_button()}
			>
				<Icon><ShieldMinus /></Icon>
			</IconButton>
		{/if}
	</div>
{/snippet}

{#snippet tabsSnippet()}
	<div class="tab-bar" role="tablist">
		<button type="button" class="tab active" role="tab" aria-selected="true" tabindex="0">
			{m.drivers_page_title()}
		</button>
	</div>
{/snippet}

{#snippet mobileDetail(driver: Driver)}
	<div class="detail-content">
		<dl class="detail-list">
			<div class="detail-row">
				<dt>{m.common_name()}</dt>
				<dd>{driver.name}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_email()}</dt>
				<dd>{driver.email}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_phone()}</dt>
				<dd>{driver.phone || m.drivers_detail_no_phone()}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_total_shifts()}</dt>
				<dd>{driver.totalShifts}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_completed_shifts()}</dt>
				<dd>{driver.completedShifts}</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_attendance()}</dt>
				<dd class:low={driver.attendanceRate < 0.7}>
					{formatPercent(driver.attendanceRate)}
				</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_completion()}</dt>
				<dd class:low={driver.completionRate < 0.7}>
					{formatPercent(driver.completionRate)}
				</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_weekly_cap()}</dt>
				<dd>{driver.weeklyCap} days</dd>
			</div>
			<div class="detail-row">
				<dt>{m.drivers_detail_flag_status()}</dt>
				<dd>
					{#if driver.isFlagged}
						<Chip variant="status" status="error" label={m.drivers_flag_flagged()} size="xs" />
					{:else if driver.flagWarningDate}
						<Chip variant="status" status="warning" label={m.drivers_flag_warning()} size="xs" />
					{:else}
						<Chip variant="status" status="success" label={m.drivers_flag_good()} size="xs" />
					{/if}
				</dd>
			</div>
			{#if driver.flagWarningDate}
				<div class="detail-row">
					<dt></dt>
					<dd class="warning-date">
						{m.drivers_flag_warning_date({ date: formatDate(driver.flagWarningDate) })}
					</dd>
				</div>
			{/if}
			<div class="detail-row">
				<dt>{m.drivers_detail_member_since()}</dt>
				<dd>{formatDate(driver.createdAt)}</dd>
			</div>
		</dl>

		<div class="detail-actions">
			<Button fill onclick={() => openEditModal(driver)}>
				{m.common_edit()}
				{m.drivers_header_weekly_cap()}
			</Button>
			{#if driver.isFlagged}
				<Button variant="secondary" fill onclick={(e) => openUnflagConfirm(driver, e)}>
					{m.drivers_unflag_button()}
				</Button>
			{/if}
		</div>
	</div>
{/snippet}

<svelte:head>
	<title>{m.drivers_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<DataTable
		{table}
		loading={driverStore.isLoading}
		emptyTitle={m.drivers_empty_state()}
		emptyMessage={m.drivers_empty_state_message()}
		showPagination
		showColumnVisibility
		showExport
		exportFilename="drivers"
		tabs={tabsSnippet}
		cellComponents={{
			phone: phoneCell,
			attendance: attendanceCell,
			completion: completionCell,
			weeklyCap: weeklyCapCell,
			flagStatus: flagStatusCell,
			actions: actionsCell
		}}
		mobileDetailContent={mobileDetail}
		mobileDetailTitle={m.drivers_detail_title()}
	/>
</div>

<!-- Edit Modal -->
{#if editingDriver}
	<Modal title={m.drivers_edit_title()} onClose={closeModals}>
		<form
			class="modal-form"
			onsubmit={(e) => {
				e.preventDefault();
				handleUpdate();
			}}
		>
			<div class="driver-info">
				<p class="driver-name">{editingDriver.name}</p>
				<p class="driver-email">{editingDriver.email}</p>
			</div>

			<div class="form-field">
				<label for="edit-cap">{m.drivers_cap_label()}</label>
				<Select
					id="edit-cap"
					options={weeklyCapOptions}
					value={String(formWeeklyCap)}
					onChange={(v) => (formWeeklyCap = Number(v))}
				/>
				<p class="field-hint">{m.drivers_cap_description()}</p>
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

<!-- Unflag Confirmation -->
{#if unflagConfirm}
	<ConfirmationDialog
		x={unflagConfirm.x}
		y={unflagConfirm.y}
		title={m.drivers_unflag_confirm_title()}
		description={m.drivers_unflag_confirm_message()}
		confirmLabel={m.drivers_unflag_button()}
		onConfirm={handleUnflag}
		onCancel={() => (unflagConfirm = null)}
	/>
{/if}

<style>
	.cell-actions {
		display: flex;
		gap: var(--spacing-1);
	}

	/* Phone cell styling */
	.phone {
		color: var(--text-normal);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
	}

	.no-phone {
		color: var(--text-muted);
		font-style: italic;
	}

	/* Metric styling */
	.metric {
		color: var(--text-normal);
		font-variant-numeric: tabular-nums;
	}

	.metric.low {
		color: var(--status-error);
	}

	.weekly-cap {
		color: var(--text-normal);
	}

	/* Detail drawer */
	.detail-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.detail-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		margin: 0;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-2) 0;
		border-bottom: 1px solid var(--border-muted);
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

	.detail-row dd.low {
		color: var(--status-error);
	}

	.warning-date {
		font-size: var(--font-size-xs);
		color: var(--status-warning);
	}

	.detail-actions {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
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

	/* Modal form */
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.driver-info {
		padding: var(--spacing-3);
		background: var(--surface-secondary);
		border-radius: var(--radius-md);
	}

	.driver-name {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.driver-email {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
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

	.field-hint {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}
</style>
