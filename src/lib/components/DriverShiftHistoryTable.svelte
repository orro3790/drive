<!--
	Driver Shift History Table

	Displays a driver's completed and cancelled shift records in a DataTable.
	Fetches data from /api/drivers/[id]/shifts on mount.
	Clicking a row opens a Drawer with shift details and (for completed shifts) edit capability.
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
	import Drawer from '$lib/components/primitives/Drawer.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Textarea from '$lib/components/primitives/Textarea.svelte';
	import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
	import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
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

	// Drawer state
	let selectedShift = $state<DriverShiftRecord | null>(null);
	let isEditing = $state(false);
	let isSaving = $state(false);

	// Edit form fields
	let formParcelsStart = $state(0);
	let formParcelsReturned = $state(0);
	let formExceptedReturns = $state(0);
	let formExceptionNotes = $state('');

	// Validation errors
	let errorReturned = $state('');
	let errorExcepted = $state('');
	let errorNotes = $state('');

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
			sizing: 'fixed',
			width: 180
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

	async function loadShifts(): Promise<void> {
		try {
			const res = await fetch(`/api/drivers/${driverId}/shifts`);
			if (!res.ok) throw new Error('Failed to load shift history');
			const data = await res.json();
			shifts = data.shifts ?? [];
		} catch {
			toastStore.error(m.drivers_shift_history_load_error());
		}
	}

	onMount(async () => {
		await loadShifts();
		isLoading = false;
	});

	function handleRowClick(row: DriverShiftRecord) {
		selectedShift = row;
		isEditing = false;
		clearErrors();
	}

	function closeDrawer() {
		selectedShift = null;
		isEditing = false;
		clearErrors();
	}

	function startEditing() {
		if (!selectedShift) return;
		formParcelsStart = selectedShift.parcelsStart ?? 0;
		formParcelsReturned = selectedShift.parcelsReturned ?? 0;
		formExceptedReturns = selectedShift.exceptedReturns ?? 0;
		formExceptionNotes = selectedShift.exceptionNotes ?? '';
		clearErrors();
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		clearErrors();
	}

	function clearErrors() {
		errorReturned = '';
		errorExcepted = '';
		errorNotes = '';
	}

	function validate(): boolean {
		clearErrors();
		let valid = true;

		if (formParcelsReturned > formParcelsStart) {
			errorReturned = m.shift_edit_error_returned_exceeds_start();
			valid = false;
		}

		if (formExceptedReturns > formParcelsReturned) {
			errorExcepted = m.shift_edit_error_excepted_exceeds_returned();
			valid = false;
		}

		if (formExceptedReturns > 0 && formExceptionNotes.trim().length === 0) {
			errorNotes = m.shift_edit_error_notes_required();
			valid = false;
		}

		return valid;
	}

	function parseIntSafe(value: string): number {
		const parsed = parseInt(value, 10);
		return isNaN(parsed) ? 0 : parsed;
	}

	async function saveEdit() {
		if (!selectedShift || !ensureOnlineForWrite()) return;
		if (!validate()) return;

		isSaving = true;
		try {
			const res = await fetch(
				`/api/drivers/${driverId}/shifts/${selectedShift.assignmentId}/edit`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						parcelsStart: formParcelsStart,
						parcelsReturned: formParcelsReturned,
						exceptedReturns: formExceptedReturns,
						exceptionNotes: formExceptionNotes || undefined
					})
				}
			);

			if (!res.ok) {
				throw new Error('Save failed');
			}

			toastStore.success(m.shift_edit_save_success());

			// Full-refetch to get updated data
			const savedAssignmentId = selectedShift.assignmentId;
			await loadShifts();

			// Find the updated record in the refreshed list
			const updated = shifts.find((s) => s.assignmentId === savedAssignmentId);
			selectedShift = updated ?? null;
			isEditing = false;
		} catch {
			toastStore.error(m.shift_edit_save_error());
		} finally {
			isSaving = false;
		}
	}
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
	onRowClick={handleRowClick}
	activeRowId={selectedShift?.assignmentId}
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

{#if selectedShift}
	<Drawer title={m.shift_detail_title()} onClose={closeDrawer}>
		<div class="shift-detail">
			<div class="detail-row">
				<span class="detail-label">{m.shift_detail_date()}</span>
				<span class="detail-value">{selectedShift.date}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">{m.shift_detail_route()}</span>
				<span class="detail-value">{selectedShift.routeName}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">{m.shift_detail_warehouse()}</span>
				<span class="detail-value">{selectedShift.warehouseName}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">{m.shift_detail_status()}</span>
				<span class="detail-value">
					<Chip
						label={selectedShift.status === 'completed'
							? m.drivers_shift_history_status_completed()
							: m.drivers_shift_history_status_cancelled()}
						variant="status"
						status={selectedShift.status === 'completed' ? 'success' : 'warning'}
						size="xs"
					/>
				</span>
			</div>

			<hr class="detail-divider" />

			{#if isEditing}
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_parcels_start()}</span>
					<div class="detail-edit">
						<InlineEditor
							value={String(formParcelsStart)}
							inputType="number"
							inputmode="numeric"
							min={1}
							max={999}
							size="sm"
							onInput={(v) => {
								formParcelsStart = parseIntSafe(v);
							}}
							hasError={!!errorReturned}
						/>
					</div>
				</div>
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_parcels_returned()}</span>
					<div class="detail-edit">
						<InlineEditor
							value={String(formParcelsReturned)}
							inputType="number"
							inputmode="numeric"
							min={0}
							max={999}
							size="sm"
							onInput={(v) => {
								formParcelsReturned = parseIntSafe(v);
							}}
							hasError={!!errorReturned}
						/>
						{#if errorReturned}
							<span class="field-error">{errorReturned}</span>
						{/if}
					</div>
				</div>
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_excepted_returns()}</span>
					<div class="detail-edit">
						<InlineEditor
							value={String(formExceptedReturns)}
							inputType="number"
							inputmode="numeric"
							min={0}
							max={999}
							size="sm"
							onInput={(v) => {
								formExceptedReturns = parseIntSafe(v);
							}}
							hasError={!!errorExcepted}
						/>
						{#if errorExcepted}
							<span class="field-error">{errorExcepted}</span>
						{/if}
					</div>
				</div>
				<div class="detail-row stacked">
					<span class="detail-label">{m.shift_detail_exception_notes()}</span>
					<Textarea
						value={formExceptionNotes}
						rows={3}
						resize="none"
						error={!!errorNotes}
						placeholder="..."
						onInput={(v) => {
							formExceptionNotes = v;
						}}
					/>
					{#if errorNotes}
						<span class="field-error">{errorNotes}</span>
					{/if}
				</div>
				<div class="section-actions">
					<Button variant="ghost" size="small" onclick={cancelEditing} disabled={isSaving}>
						{m.common_cancel()}
					</Button>
					<Button size="small" onclick={saveEdit} isLoading={isSaving}>
						{m.common_confirm()}
					</Button>
				</div>
			{:else}
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_parcels_start()}</span>
					<span class="detail-value">{selectedShift.parcelsStart ?? '\u2014'}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_parcels_delivered()}</span>
					<span class="detail-value">{selectedShift.parcelsDelivered ?? '\u2014'}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_parcels_returned()}</span>
					<span class="detail-value">{selectedShift.parcelsReturned ?? '\u2014'}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">{m.shift_detail_excepted_returns()}</span>
					<span class="detail-value">{selectedShift.exceptedReturns ?? '\u2014'}</span>
				</div>
				<div class="detail-row stacked">
					<span class="detail-label">{m.shift_detail_exception_notes()}</span>
					<span class="detail-value notes-block">{selectedShift.exceptionNotes ?? '\u2014'}</span>
				</div>
				{#if selectedShift.status === 'completed'}
					<div class="section-actions">
						<Button variant="secondary" size="small" onclick={startEditing}>
							{m.shift_edit_button()}
						</Button>
					</div>
				{/if}
			{/if}

			<hr class="detail-divider" />

			<div class="detail-row">
				<span class="detail-label">{m.shift_detail_arrived_at()}</span>
				<span class="detail-value timestamp">{formatTimestamp(selectedShift.arrivedAt)}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">{m.shift_detail_completed_at()}</span>
				<span class="detail-value timestamp">{formatTimestamp(selectedShift.completedAt)}</span>
			</div>
		</div>
	</Drawer>
{/if}

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

	.shift-detail {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: var(--spacing-2) 0;
		gap: var(--spacing-3);
	}

	.detail-label {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		flex-shrink: 0;
		min-width: 120px;
	}

	.detail-value {
		font-size: var(--font-size-sm);
		color: var(--text-normal);
		text-align: right;
		word-break: break-word;
	}

	.detail-row.stacked {
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.notes-block {
		text-align: left;
		white-space: pre-wrap;
	}

	.detail-edit {
		flex: 1;
		max-width: 200px;
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.section-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
		padding-bottom: var(--spacing-2);
	}

	.detail-divider {
		border: none;
		border-top: 1px solid var(--border-muted);
		margin: var(--spacing-2) 0;
	}

	.field-error {
		font-size: var(--font-size-xs);
		color: var(--status-error);
	}
</style>
