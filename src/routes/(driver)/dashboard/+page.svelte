<!--
	Driver Dashboard

	Main landing page for drivers showing:
	- Today's shift (if any) with start/complete actions
	- This week and next week schedule summaries
	- Personal metrics (attendance, completion rates)
	- Pending bids with countdown timers
	- New driver welcome banner
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { format, parseISO, formatDistanceToNow } from 'date-fns';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Select from '$lib/components/Select.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import NoticeBanner from '$lib/components/primitives/NoticeBanner.svelte';
	import { dashboardStore, type DashboardAssignment } from '$lib/stores/dashboardStore.svelte';
	import {
		cancelReasonValues,
		type AssignmentStatus,
		type CancelReason
	} from '$lib/schemas/assignment';
	import type { SelectOption } from '$lib/schemas/ui/select';

	// Cancel modal state
	let cancelTarget = $state<DashboardAssignment | null>(null);
	let cancelReason = $state<CancelReason | ''>('');
	let cancelError = $state<string | null>(null);

	// Shift start modal state
	let startTarget = $state<DashboardAssignment | null>(null);
	let parcelsStart = $state<number | ''>('');
	let startError = $state<string | null>(null);

	// Shift complete modal state
	let completeTarget = $state<DashboardAssignment | null>(null);
	let parcelsDelivered = $state<number | ''>('');
	let parcelsReturned = $state<number | ''>(0);
	let completeError = $state<string | null>(null);

	const statusLabels: Record<AssignmentStatus, string> = {
		scheduled: m.schedule_status_scheduled(),
		active: m.schedule_status_active(),
		completed: m.schedule_status_completed(),
		cancelled: m.schedule_status_cancelled(),
		unfilled: m.schedule_status_unfilled()
	};

	const statusChips: Record<
		AssignmentStatus,
		'info' | 'success' | 'warning' | 'error' | 'neutral'
	> = {
		scheduled: 'info',
		active: 'warning',
		completed: 'success',
		cancelled: 'neutral',
		unfilled: 'warning'
	};

	const cancelReasonLabels: Record<CancelReason, string> = {
		vehicle_breakdown: m.schedule_cancel_reason_vehicle_breakdown(),
		medical_emergency: m.schedule_cancel_reason_medical_emergency(),
		family_emergency: m.schedule_cancel_reason_family_emergency(),
		traffic_accident: m.schedule_cancel_reason_traffic_accident(),
		weather_conditions: m.schedule_cancel_reason_weather_conditions(),
		personal_emergency: m.schedule_cancel_reason_personal_emergency(),
		other: m.schedule_cancel_reason_other()
	};

	const cancelReasonOptions: SelectOption[] = cancelReasonValues.map((reason) => ({
		value: reason,
		label: cancelReasonLabels[reason]
	}));

	function formatAssignmentDate(dateString: string) {
		return format(parseISO(dateString), 'EEE, MMM d');
	}

	function formatClosesAt(isoString: string) {
		const date = parseISO(isoString);
		return m.bids_window_closes({
			time: formatDistanceToNow(date, { addSuffix: true })
		});
	}

	function formatPercentage(rate: number) {
		return `${Math.round(rate * 100)}%`;
	}

	// Cancel modal functions
	function openCancelModal(assignment: DashboardAssignment) {
		cancelTarget = assignment;
		cancelReason = '';
		cancelError = null;
	}

	function closeCancelModal() {
		cancelTarget = null;
		cancelReason = '';
		cancelError = null;
	}

	async function submitCancellation() {
		if (!cancelTarget) return;
		if (!cancelReason) {
			cancelError = m.schedule_cancel_reason_required();
			return;
		}

		const success = await dashboardStore.cancel(cancelTarget.id, cancelReason);
		if (success) {
			closeCancelModal();
		}
	}

	// Shift start modal functions
	function openStartModal(assignment: DashboardAssignment) {
		startTarget = assignment;
		parcelsStart = '';
		startError = null;
	}

	function closeStartModal() {
		startTarget = null;
		parcelsStart = '';
		startError = null;
	}

	async function submitStartShift() {
		if (!startTarget) return;
		if (parcelsStart === '' || parcelsStart < 0) {
			startError = m.shift_start_parcels_required();
			return;
		}

		const success = await dashboardStore.startShift(startTarget.id, parcelsStart);
		if (success) {
			closeStartModal();
		}
	}

	// Shift complete modal functions
	function openCompleteModal(assignment: DashboardAssignment) {
		completeTarget = assignment;
		parcelsDelivered = '';
		parcelsReturned = 0;
		completeError = null;
	}

	function closeCompleteModal() {
		completeTarget = null;
		parcelsDelivered = '';
		parcelsReturned = 0;
		completeError = null;
	}

	async function submitCompleteShift() {
		if (!completeTarget) return;
		if (parcelsDelivered === '' || parcelsDelivered < 0) {
			completeError = m.shift_complete_delivered_required();
			return;
		}

		const returnedValue = parcelsReturned === '' ? 0 : parcelsReturned;
		const success = await dashboardStore.completeShift(
			completeTarget.id,
			parcelsDelivered,
			returnedValue
		);
		if (success) {
			closeCompleteModal();
		}
	}

	onMount(() => {
		dashboardStore.load();
	});
</script>

<svelte:head>
	<title>{m.dashboard_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.dashboard_page_title()}</h1>
				<p>{m.dashboard_page_description()}</p>
			</div>
		</div>

		{#if dashboardStore.isLoading}
			<div class="loading-state">
				<Spinner size={24} label={m.dashboard_loading_label()} />
			</div>
		{:else}
			<div class="dashboard-sections">
				<!-- New Driver Banner -->
				{#if dashboardStore.isNewDriver}
					<NoticeBanner variant="info" align="start">
						<div class="banner-content">
							<h3>{m.dashboard_new_driver_title()}</h3>
							<p>{m.dashboard_new_driver_message()}</p>
						</div>
					</NoticeBanner>
				{/if}

				<!-- Today's Shift -->
				<section class="dashboard-section">
					<div class="section-header">
						<h2>{m.dashboard_today_section()}</h2>
					</div>

					{#if dashboardStore.todayShift}
						{@const shift = dashboardStore.todayShift}
						<div class="today-card">
							<div class="card-header">
								<div class="card-summary">
									<p class="today-date">{formatAssignmentDate(shift.date)}</p>
									<p class="today-route">{shift.routeName}</p>
									<p class="today-warehouse">{shift.warehouseName}</p>
								</div>
								<Chip
									variant="status"
									status={statusChips[shift.status]}
									label={statusLabels[shift.status]}
									size="xs"
								/>
							</div>

							{#if shift.isStartable || shift.isCompletable || shift.isCancelable}
								<div class="card-actions">
									{#if shift.isStartable}
										<Button variant="primary" size="small" onclick={() => openStartModal(shift)}>
											{m.shift_start_button()}
										</Button>
									{/if}
									{#if shift.isCompletable}
										<Button variant="primary" size="small" onclick={() => openCompleteModal(shift)}>
											{m.shift_complete_button()}
										</Button>
									{/if}
									{#if shift.isCancelable}
										<Button variant="danger" size="small" onclick={() => openCancelModal(shift)}>
											{m.schedule_cancel_button()}
										</Button>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<div class="empty-state">
							<p class="empty-title">{m.dashboard_today_no_shift()}</p>
							<p class="empty-message">{m.dashboard_today_no_shift_message()}</p>
						</div>
					{/if}
				</section>

				<!-- Needs Confirmation -->
				{#if dashboardStore.unconfirmedShifts.length > 0}
					<section class="dashboard-section">
						<div class="section-header">
							<h2 class="warning-heading">{m.dashboard_confirm_section()}</h2>
							<Chip
								variant="status"
								status="warning"
								size="sm"
								label={String(dashboardStore.unconfirmedShifts.length)}
							/>
						</div>

						<div class="confirm-list">
							{#each dashboardStore.unconfirmedShifts as shift (shift.id)}
								<div class="confirm-card">
									<div class="card-summary">
										<p class="confirm-date">{formatAssignmentDate(shift.date)}</p>
										<p class="confirm-route">{shift.routeName}</p>
										<p class="confirm-deadline">
											{m.dashboard_confirm_deadline({
												deadline: formatDistanceToNow(parseISO(shift.confirmationDeadline), {
													addSuffix: true
												})
											})}
										</p>
									</div>
									{#if shift.isConfirmable}
										<Button
											variant="primary"
											size="small"
											isLoading={dashboardStore.isConfirming}
											onclick={() => dashboardStore.confirmShift(shift.id)}
										>
											{m.dashboard_confirm_button()}
										</Button>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Week Summaries Row -->
				<div class="week-row">
					<!-- This Week -->
					<section class="dashboard-section week-section">
						<div class="section-header">
							<h2>{m.dashboard_week_section_this()}</h2>
						</div>

						{#if dashboardStore.thisWeek && dashboardStore.thisWeek.assignedDays > 0}
							<div class="week-summary">
								<p class="week-count">
									{m.dashboard_week_days_assigned({ count: dashboardStore.thisWeek.assignedDays })}
								</p>
								<div class="week-days">
									{#each dashboardStore.thisWeek.assignments as assignment (assignment.id)}
										<div class="day-chip">
											{format(parseISO(assignment.date), 'EEE')}
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="empty-state compact">
								<p class="empty-title">{m.dashboard_week_no_shifts()}</p>
							</div>
						{/if}
					</section>

					<!-- Next Week -->
					<section class="dashboard-section week-section">
						<div class="section-header">
							<h2>{m.dashboard_week_section_next()}</h2>
						</div>

						{#if dashboardStore.nextWeek && dashboardStore.nextWeek.assignedDays > 0}
							<div class="week-summary">
								<p class="week-count">
									{m.dashboard_week_days_assigned({ count: dashboardStore.nextWeek.assignedDays })}
								</p>
								<div class="week-days">
									{#each dashboardStore.nextWeek.assignments as assignment (assignment.id)}
										<div class="day-chip">
											{format(parseISO(assignment.date), 'EEE')}
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="empty-state compact">
								<p class="empty-title">{m.dashboard_week_no_shifts()}</p>
							</div>
						{/if}
					</section>
				</div>

				<!-- Metrics -->
				<section class="dashboard-section">
					<div class="section-header">
						<h2>{m.dashboard_metrics_section()}</h2>
					</div>

					<div class="metrics-grid">
						<div class="metric-card">
							<p class="metric-value">{formatPercentage(dashboardStore.metrics.attendanceRate)}</p>
							<p class="metric-label">{m.dashboard_metrics_attendance()}</p>
						</div>
						<div class="metric-card">
							<p class="metric-value">{formatPercentage(dashboardStore.metrics.completionRate)}</p>
							<p class="metric-label">{m.dashboard_metrics_completion()}</p>
						</div>
						<div class="metric-card">
							<p class="metric-value">{dashboardStore.metrics.totalShifts}</p>
							<p class="metric-label">{m.dashboard_metrics_total_shifts()}</p>
						</div>
						<div class="metric-card">
							<p class="metric-value">{dashboardStore.metrics.completedShifts}</p>
							<p class="metric-label">{m.dashboard_metrics_completed_shifts()}</p>
						</div>
					</div>
				</section>

				<!-- Pending Bids -->
				<section class="dashboard-section">
					<div class="section-header">
						<h2>{m.dashboard_bids_section()}</h2>
						{#if dashboardStore.pendingBids.length > 0}
							<Button variant="ghost" size="small" onclick={() => goto('/bids')}>
								{m.dashboard_bids_view_all()}
							</Button>
						{/if}
					</div>

					{#if dashboardStore.pendingBids.length === 0}
						<div class="empty-state">
							<p class="empty-title">{m.dashboard_bids_empty()}</p>
							<p class="empty-message">{m.dashboard_bids_empty_message()}</p>
						</div>
					{:else}
						<div class="bid-list">
							{#each dashboardStore.pendingBids.slice(0, 3) as bid (bid.id)}
								<div class="bid-card">
									<div class="card-summary">
										<p class="bid-date">{formatAssignmentDate(bid.assignmentDate)}</p>
										<p class="bid-route">{bid.routeName}</p>
									</div>
									<p class="bid-closes">{formatClosesAt(bid.windowClosesAt)}</p>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</div>
</div>

<!-- Cancel Modal -->
{#if cancelTarget}
	<Modal title={m.schedule_cancel_modal_title()} onClose={closeCancelModal}>
		<form
			class="modal-form"
			onsubmit={(event) => {
				event.preventDefault();
				submitCancellation();
			}}
		>
			<div class="form-field">
				<label for="cancel-reason">{m.schedule_cancel_reason_label()}</label>
				<Select
					id="cancel-reason"
					options={cancelReasonOptions}
					bind:value={cancelReason}
					placeholder={m.schedule_cancel_reason_placeholder()}
					errors={cancelError ? [cancelError] : []}
					onChange={() => (cancelError = null)}
				/>
			</div>

			{#if cancelTarget.isLateCancel}
				<div class="late-warning">{m.schedule_cancel_warning_late()}</div>
			{/if}

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeCancelModal} fill>
					{m.common_cancel()}
				</Button>
				<Button variant="danger" type="submit" fill isLoading={dashboardStore.isCancelling}>
					{m.schedule_cancel_confirm_button()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Start Shift Modal -->
{#if startTarget}
	<Modal title={m.shift_start_modal_title()} onClose={closeStartModal}>
		<form
			class="modal-form"
			onsubmit={(event) => {
				event.preventDefault();
				submitStartShift();
			}}
		>
			<div class="form-field">
				<label for="parcels-start">{m.shift_start_parcels_label()}</label>
				<input
					id="parcels-start"
					type="number"
					class="number-input"
					class:has-error={startError}
					min="0"
					max="999"
					placeholder={m.shift_start_parcels_placeholder()}
					bind:value={parcelsStart}
					oninput={() => (startError = null)}
				/>
				{#if startError}
					<p class="field-error">{startError}</p>
				{/if}
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeStartModal} fill>
					{m.common_cancel()}
				</Button>
				<Button variant="primary" type="submit" fill isLoading={dashboardStore.isStartingShift}>
					{m.shift_start_confirm_button()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<!-- Complete Shift Modal -->
{#if completeTarget}
	<Modal title={m.shift_complete_modal_title()} onClose={closeCompleteModal}>
		<form
			class="modal-form"
			onsubmit={(event) => {
				event.preventDefault();
				submitCompleteShift();
			}}
		>
			<div class="form-field">
				<label for="parcels-delivered">{m.shift_complete_delivered_label()}</label>
				<input
					id="parcels-delivered"
					type="number"
					class="number-input"
					class:has-error={completeError}
					min="0"
					max="999"
					placeholder={m.shift_complete_delivered_placeholder()}
					bind:value={parcelsDelivered}
					oninput={() => (completeError = null)}
				/>
				{#if completeError}
					<p class="field-error">{completeError}</p>
				{/if}
			</div>

			<div class="form-field">
				<label for="parcels-returned">{m.shift_complete_returned_label()}</label>
				<input
					id="parcels-returned"
					type="number"
					class="number-input"
					min="0"
					max="999"
					placeholder={m.shift_complete_returned_placeholder()}
					bind:value={parcelsReturned}
				/>
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeCompleteModal} fill>
					{m.common_cancel()}
				</Button>
				<Button variant="primary" type="submit" fill isLoading={dashboardStore.isCompletingShift}>
					{m.shift_complete_confirm_button()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<style>
	.page-surface {
		min-height: 100vh;
		background: var(--surface-inset);
	}

	.page-stage {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--spacing-4);
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-5);
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

	.loading-state {
		display: flex;
		justify-content: center;
		padding: var(--spacing-8);
	}

	.dashboard-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.dashboard-section {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-4);
		box-shadow: var(--shadow-sm);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--spacing-3);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	/* New Driver Banner */
	.banner-content h3 {
		margin: 0 0 var(--spacing-1);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	.banner-content p {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-normal);
		color: var(--text-normal);
	}

	/* Today's Shift Card */
	.today-card {
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		padding: var(--spacing-3);
		background: var(--surface-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		gap: var(--spacing-2);
		align-items: flex-start;
	}

	.card-summary {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.today-date {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.today-route {
		margin: 0;
		font-size: var(--font-size-base);
		color: var(--text-normal);
	}

	.today-warehouse {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.card-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
	}

	/* Empty States */
	.empty-state {
		padding: var(--spacing-4);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		border: 1px dashed var(--border-primary);
	}

	.empty-state.compact {
		padding: var(--spacing-3);
	}

	.empty-title {
		margin: 0 0 var(--spacing-1);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.empty-message {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	/* Week Row */
	.week-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-4);
	}

	.week-section {
		min-width: 0;
	}

	.week-summary {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.week-count {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.week-days {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1);
	}

	.day-chip {
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-sm);
		background: var(--surface-secondary);
		border: 1px solid var(--border-primary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	/* Metrics Grid */
	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-3);
	}

	.metric-card {
		padding: var(--spacing-3);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		text-align: center;
	}

	.metric-value {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.metric-label {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	/* Pending Bids */
	.bid-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.bid-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-3);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		border: 1px solid var(--border-primary);
	}

	.bid-date {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.bid-route {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.bid-closes {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	/* Needs Confirmation */
	.warning-heading {
		color: var(--status-warning);
	}

	.confirm-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.confirm-card {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-3);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		border: 1px solid var(--status-warning);
	}

	.confirm-date {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.confirm-route {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.confirm-deadline {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--status-warning);
	}

	/* Modal Styles */
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
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

	.number-input {
		width: 100%;
		padding: var(--spacing-2) var(--spacing-3);
		font-size: var(--font-size-base);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		background: var(--surface-primary);
		color: var(--text-normal);
		transition: border-color 0.15s ease;
	}

	.number-input:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	.number-input.has-error {
		border-color: var(--status-error);
	}

	.number-input::placeholder {
		color: var(--text-muted);
	}

	.field-error {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--status-error);
	}

	.late-warning {
		padding: var(--spacing-2);
		border-radius: var(--radius-base);
		background: color-mix(in srgb, var(--status-warning) 15%, transparent);
		color: var(--status-warning);
		font-size: var(--font-size-sm);
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}

	/* Responsive */
	@media (max-width: 600px) {
		.week-row {
			grid-template-columns: 1fr;
		}

		.metrics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.modal-actions {
			flex-direction: column;
		}
	}
</style>
