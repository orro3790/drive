<!--
	Driver Schedule Page

	Displays current and next week assignments with shift start/complete flow.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { addDays, format, getWeek, parseISO } from 'date-fns';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import CancelShiftModal from '$lib/components/driver/CancelShiftModal.svelte';
	import { scheduleStore, type ScheduleAssignment } from '$lib/stores/scheduleStore.svelte';
	import {
		getAssignmentActions,
		type AssignmentLifecycleActionId
	} from '$lib/config/driverLifecycleIa';
	import { statusLabels, statusChipVariants } from '$lib/config/lifecycleLabels';
	import { formatAssignmentDate } from '$lib/utils/date/formatting';
	import type { CancelReason } from '$lib/schemas/assignment';

	// Cancel modal state
	let cancelTarget = $state<ScheduleAssignment | null>(null);

	// Shift start modal state
	let startTarget = $state<ScheduleAssignment | null>(null);
	let parcelsStart = $state<number | ''>('');
	let startError = $state<string | null>(null);

	// Shift complete modal state
	let completeTarget = $state<ScheduleAssignment | null>(null);
	let parcelsReturned = $state<number | ''>(0);
	let completeError = $state<string | null>(null);

	const sortedAssignments = $derived(
		[...scheduleStore.assignments].sort((a, b) => a.date.localeCompare(b.date))
	);

	const weekStartDate = $derived(
		scheduleStore.weekStart ? parseISO(scheduleStore.weekStart) : null
	);
	const nextWeekStartDate = $derived(
		scheduleStore.nextWeekStart ? parseISO(scheduleStore.nextWeekStart) : null
	);

	const thisWeekAssignments = $derived.by(() => {
		const weekStart = scheduleStore.weekStart;
		const nextWeekStart = scheduleStore.nextWeekStart;
		if (!weekStart || !nextWeekStart) return [];
		return sortedAssignments.filter(
			(assignment) => assignment.date >= weekStart && assignment.date < nextWeekStart
		);
	});

	const nextWeekAssignments = $derived.by(() => {
		const nextWeekStart = scheduleStore.nextWeekStart;
		if (!nextWeekStart) return [];
		return sortedAssignments.filter((assignment) => assignment.date >= nextWeekStart);
	});

	function formatWeekRange(startDate: Date) {
		const endDate = addDays(startDate, 6);
		return m.schedule_week_range({
			range: `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`
		});
	}

	function formatWeekLabel(startDate: Date, isNext: boolean) {
		const weekNumber = getWeek(startDate, { weekStartsOn: 1 });
		return isNext
			? m.schedule_week_next({ week: weekNumber })
			: m.schedule_week_current({ week: weekNumber });
	}

	function getConfirmationState(assignment: ScheduleAssignment) {
		if (assignment.confirmedAt) return 'confirmed';
		if (assignment.isConfirmable) return 'confirmable';
		if (assignment.status === 'scheduled' && !assignment.confirmedAt) {
			const now = new Date();
			const opensAt = parseISO(assignment.confirmationOpensAt);
			if (now < opensAt) return 'not_open';
		}
		return 'none';
	}

	type ScheduleActionId = Extract<
		AssignmentLifecycleActionId,
		'confirm_shift' | 'record_inventory' | 'complete_shift' | 'cancel_shift'
	>;

	function getScheduleActions(assignment: ScheduleAssignment): ScheduleActionId[] {
		return getAssignmentActions(assignment, 'schedule').filter(
			(actionId): actionId is ScheduleActionId =>
				actionId === 'confirm_shift' ||
				actionId === 'record_inventory' ||
				actionId === 'complete_shift' ||
				actionId === 'cancel_shift'
		);
	}

	function getScheduleActionLabel(actionId: ScheduleActionId) {
		switch (actionId) {
			case 'confirm_shift':
				return m.schedule_confirm_button();
			case 'record_inventory':
				return m.shift_start_button();
			case 'complete_shift':
				return m.shift_complete_button();
			case 'cancel_shift':
				return m.schedule_cancel_button();
		}
	}

	function getScheduleActionVariant(actionId: ScheduleActionId): 'primary' | 'danger' {
		return actionId === 'cancel_shift' ? 'danger' : 'primary';
	}

	function isScheduleActionLoading(actionId: ScheduleActionId): boolean {
		switch (actionId) {
			case 'confirm_shift':
				return scheduleStore.isConfirming;
			case 'record_inventory':
				return scheduleStore.isStartingShift;
			case 'complete_shift':
				return scheduleStore.isCompletingShift;
			case 'cancel_shift':
				return scheduleStore.isCancelling;
		}
	}

	function handleScheduleAction(actionId: ScheduleActionId, assignment: ScheduleAssignment) {
		switch (actionId) {
			case 'confirm_shift':
				scheduleStore.confirmShift(assignment.id);
				return;
			case 'record_inventory':
				openStartModal(assignment);
				return;
			case 'complete_shift':
				openCompleteModal(assignment);
				return;
			case 'cancel_shift':
				openCancelModal(assignment);
				return;
		}
	}

	function openCancelModal(assignment: ScheduleAssignment) {
		cancelTarget = assignment;
	}

	function closeCancelModal() {
		cancelTarget = null;
	}

	async function handleCancel(reason: CancelReason) {
		if (!cancelTarget) return;
		const success = await scheduleStore.cancel(cancelTarget.id, reason);
		if (success) {
			closeCancelModal();
		}
	}

	// Shift start modal functions
	function openStartModal(assignment: ScheduleAssignment) {
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

		const success = await scheduleStore.startShift(startTarget.id, parcelsStart);
		if (success) {
			closeStartModal();
		}
	}

	// Shift complete modal functions
	function openCompleteModal(assignment: ScheduleAssignment) {
		completeTarget = assignment;
		parcelsReturned = 0;
		completeError = null;
	}

	function closeCompleteModal() {
		completeTarget = null;
		parcelsReturned = 0;
		completeError = null;
	}

	async function submitCompleteShift() {
		if (!completeTarget) return;
		if (parcelsReturned === '') {
			completeError = m.shift_complete_returned_required();
			return;
		}

		const returnedValue = typeof parcelsReturned === 'number' ? parcelsReturned : 0;
		const success = await scheduleStore.completeShift(completeTarget.id, returnedValue);
		if (success) {
			closeCompleteModal();
		}
	}

	onMount(() => {
		scheduleStore.load();
	});
</script>

<svelte:head>
	<title>{m.schedule_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.schedule_page_title()}</h1>
				<p>{m.schedule_page_description()}</p>
			</div>
		</div>

		{#if scheduleStore.isLoading}
			<div class="loading-state">
				<Spinner size={24} label={m.schedule_loading_label()} />
			</div>
		{:else}
			<div class="schedule-sections">
				<section class="schedule-section">
					{#if weekStartDate}
						<div class="section-header">
							<div>
								<h2>{formatWeekLabel(weekStartDate, false)}</h2>
								<p>{formatWeekRange(weekStartDate)}</p>
							</div>
						</div>
					{/if}

					{#if thisWeekAssignments.length === 0}
						<div class="empty-state">
							<p class="empty-title">{m.schedule_empty_title()}</p>
							<p class="empty-message">{m.schedule_empty_message()}</p>
						</div>
					{:else}
						<div class="assignment-list">
							{#each thisWeekAssignments as assignment (assignment.id)}
								<div class="assignment-card" class:cancelled={assignment.status === 'cancelled'}>
									<div class="card-header">
										<div class="card-summary">
											<p class="assignment-date">{formatAssignmentDate(assignment.date)}</p>
											<p class="assignment-route">{assignment.routeName}</p>
											<p class="assignment-warehouse">{assignment.warehouseName}</p>
										</div>
										<div class="card-chips">
											<Chip
												variant="status"
												status={statusChipVariants[assignment.status]}
												label={statusLabels[assignment.status]}
												size="xs"
											/>
											{#if getConfirmationState(assignment) === 'confirmed'}
												<Chip
													variant="status"
													status="success"
													label={m.schedule_confirmed_chip()}
													size="xs"
												/>
											{:else if getConfirmationState(assignment) === 'confirmable'}
												<Chip
													variant="status"
													status="warning"
													label={m.schedule_confirm_by_chip({
														date: format(parseISO(assignment.confirmationDeadline), 'MMM d')
													})}
													size="xs"
												/>
											{:else if getConfirmationState(assignment) === 'not_open'}
												<Chip
													variant="status"
													status="neutral"
													label={m.schedule_confirm_opens_chip({
														date: format(parseISO(assignment.confirmationOpensAt), 'MMM d')
													})}
													size="xs"
												/>
											{/if}
										</div>
									</div>

									{#if getScheduleActions(assignment).length > 0}
										<div class="card-actions">
											{#each getScheduleActions(assignment) as actionId (actionId)}
												<Button
													variant={getScheduleActionVariant(actionId)}
													size="small"
													fill={actionId === 'confirm_shift'}
													isLoading={isScheduleActionLoading(actionId)}
													onclick={() => handleScheduleAction(actionId, assignment)}
												>
													{getScheduleActionLabel(actionId)}
												</Button>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="schedule-section">
					{#if nextWeekStartDate}
						<div class="section-header">
							<div>
								<h2>{formatWeekLabel(nextWeekStartDate, true)}</h2>
								<p>{formatWeekRange(nextWeekStartDate)}</p>
							</div>
						</div>
					{/if}

					{#if nextWeekAssignments.length === 0}
						<div class="empty-state">
							<p class="empty-title">{m.schedule_empty_title()}</p>
							<p class="empty-message">{m.schedule_empty_message()}</p>
						</div>
					{:else}
						<div class="assignment-list">
							{#each nextWeekAssignments as assignment (assignment.id)}
								<div class="assignment-card" class:cancelled={assignment.status === 'cancelled'}>
									<div class="card-header">
										<div class="card-summary">
											<p class="assignment-date">{formatAssignmentDate(assignment.date)}</p>
											<p class="assignment-route">{assignment.routeName}</p>
											<p class="assignment-warehouse">{assignment.warehouseName}</p>
										</div>
										<div class="card-chips">
											<Chip
												variant="status"
												status={statusChipVariants[assignment.status]}
												label={statusLabels[assignment.status]}
												size="xs"
											/>
											{#if getConfirmationState(assignment) === 'confirmed'}
												<Chip
													variant="status"
													status="success"
													label={m.schedule_confirmed_chip()}
													size="xs"
												/>
											{:else if getConfirmationState(assignment) === 'confirmable'}
												<Chip
													variant="status"
													status="warning"
													label={m.schedule_confirm_by_chip({
														date: format(parseISO(assignment.confirmationDeadline), 'MMM d')
													})}
													size="xs"
												/>
											{:else if getConfirmationState(assignment) === 'not_open'}
												<Chip
													variant="status"
													status="neutral"
													label={m.schedule_confirm_opens_chip({
														date: format(parseISO(assignment.confirmationOpensAt), 'MMM d')
													})}
													size="xs"
												/>
											{/if}
										</div>
									</div>

									{#if getScheduleActions(assignment).length > 0}
										<div class="card-actions">
											{#each getScheduleActions(assignment) as actionId (actionId)}
												<Button
													variant={getScheduleActionVariant(actionId)}
													size="small"
													fill={actionId === 'confirm_shift'}
													isLoading={isScheduleActionLoading(actionId)}
													onclick={() => handleScheduleAction(actionId, assignment)}
												>
													{getScheduleActionLabel(actionId)}
												</Button>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{/if}
	</div>
</div>

{#if cancelTarget}
	<CancelShiftModal
		isLateCancel={cancelTarget.isLateCancel}
		isLoading={scheduleStore.isCancelling}
		onCancel={handleCancel}
		onClose={closeCancelModal}
	/>
{/if}

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
				<Button variant="primary" type="submit" fill isLoading={scheduleStore.isStartingShift}>
					{m.shift_start_confirm_button()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

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
				<label for="parcels-returned">{m.shift_complete_returned_label()}</label>
				<input
					id="parcels-returned"
					type="number"
					class="number-input"
					class:has-error={completeError}
					min="0"
					max={completeTarget?.shift?.parcelsStart ?? 999}
					placeholder={m.shift_complete_returned_placeholder()}
					bind:value={parcelsReturned}
					oninput={() => (completeError = null)}
				/>
				{#if completeError}
					<p class="field-error">{completeError}</p>
				{/if}
			</div>

			<div class="modal-actions">
				<Button variant="secondary" onclick={closeCompleteModal} fill>
					{m.common_cancel()}
				</Button>
				<Button variant="primary" type="submit" fill isLoading={scheduleStore.isCompletingShift}>
					{m.shift_complete_confirm_button()}
				</Button>
			</div>
		</form>
	</Modal>
{/if}

<style>
	.page-surface {
		min-height: 100%;
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

	.schedule-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.schedule-section {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-4);
		box-shadow: var(--shadow-sm);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--spacing-3);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.section-header p {
		margin: var(--spacing-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.empty-state {
		padding: var(--spacing-4);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		border: none;
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

	.assignment-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.assignment-card {
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		padding: var(--spacing-3);
		background: var(--surface-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.assignment-card.cancelled {
		opacity: 0.7;
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

	.assignment-date {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.assignment-route {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
	}

	.assignment-warehouse {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.card-chips {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--spacing-1);
	}

	.card-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
	}

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

	.modal-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}

	@media (max-width: 600px) {
		.schedule-section {
			padding: 0;
		}

		.modal-actions {
			flex-direction: column;
		}
	}
</style>
