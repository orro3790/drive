<!--
	Driver Schedule Page

	Displays current and next week assignments with shift start/complete flow.
	Design follows notification-item patterns: flat rows, single accent per status,
	icon anchors, tag chips for metadata.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { addDays, format, getWeek, parseISO } from 'date-fns';
	import type { Component } from 'svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import IconBase from '$lib/components/primitives/Icon.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import CancelShiftModal from '$lib/components/driver/CancelShiftModal.svelte';
	import AlertTriangleIcon from '$lib/components/icons/AlertTriangleIcon.svelte';
	import CalendarCheck from '$lib/components/icons/CalendarCheck.svelte';
	import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
	import CalendarExclamation from '$lib/components/icons/CalendarExclamation.svelte';
	import CalendarX from '$lib/components/icons/CalendarX.svelte';
	import Clock from '$lib/components/icons/Clock.svelte';
	import HealthLine from '$lib/components/icons/HealthLine.svelte';
	import QuestionMark from '$lib/components/icons/QuestionMark.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';
	import { dispatchPolicy } from '$lib/config/dispatchPolicy';
	import { scheduleStore, type ScheduleAssignment } from '$lib/stores/scheduleStore.svelte';
	import {
		getAssignmentActions,
		type AssignmentLifecycleActionId
	} from '$lib/config/driverLifecycleIa';
	import { statusLabels } from '$lib/config/lifecycleLabels';
	import { formatAssignmentDate } from '$lib/utils/date/formatting';
	import type { CancelReason } from '$lib/schemas/assignment';
	import type { AssignmentStatus } from '$lib/schemas/assignment';

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

	// Status → accent color mapping (single color per status)
	const statusAccent: Record<AssignmentStatus, string> = {
		completed: '--text-muted',
		scheduled: '--interactive-accent',
		active: '--status-info',
		cancelled: '--status-error',
		unfilled: '--status-warning'
	};

	// Status → icon mapping
	const statusIcon: Record<AssignmentStatus, Component> = {
		completed: CheckCircleIcon,
		scheduled: Clock,
		active: Clock,
		cancelled: CalendarExclamation,
		unfilled: CalendarExclamation
	};

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
		if (assignment.status === 'scheduled') {
			const now = new Date();
			const deadline = parseISO(assignment.confirmationDeadline);
			const opensAt = parseISO(assignment.confirmationOpensAt);
			if (now > deadline) return 'overdue';
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

	function getScheduleActionVariant(
		actionId: ScheduleActionId
	): 'primary' | 'secondary' | 'ghost' {
		if (actionId === 'cancel_shift') return 'ghost';
		if (actionId === 'confirm_shift') return 'primary';
		return 'secondary';
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

{#snippet routeChipIcon()}
	<IconBase size="small">
		<RouteIcon />
	</IconBase>
{/snippet}

{#snippet warehouseChipIcon()}
	<IconBase size="small">
		<WarehouseIcon />
	</IconBase>
{/snippet}

{#snippet assignmentRow(assignment: ScheduleAssignment)}
	{@const accent = statusAccent[assignment.status]}
	{@const Icon = statusIcon[assignment.status]}
	{@const confirmState = getConfirmationState(assignment)}
	{@const actions = getScheduleActions(assignment)}
	{@const isPast = assignment.status === 'completed' || assignment.status === 'cancelled'}
	{@const isOverdue = confirmState === 'overdue'}
	{@const cancelAction = !isOverdue && actions.includes('cancel_shift')}
	{@const confirmAction = actions.includes('confirm_shift')}
	{@const otherActions = actions.filter((a) => a !== 'confirm_shift' && a !== 'cancel_shift')}
	{@const deltas = dispatchPolicy.health.displayDeltas}
	<div
		class="assignment-item"
		class:past={isPast}
		class:overdue={isOverdue}
		style="--assignment-accent: var({accent});"
	>
		<div class="icon-circle" class:icon-confirmed={confirmState === 'confirmed'} class:icon-unconfirmed={confirmState === 'confirmable' || confirmState === 'not_open'} class:icon-overdue={isOverdue} aria-hidden="true">
			{#if assignment.status === 'scheduled'}
				{#if confirmState === 'confirmed'}
					<CalendarCheck />
				{:else if confirmState === 'overdue'}
					<AlertTriangleIcon />
				{:else if confirmState === 'confirmable' || confirmState === 'not_open'}
					<QuestionMark />
				{:else}
					<Clock />
				{/if}
			{:else}
				<Icon />
			{/if}
		</div>
		<div class="assignment-content">
			<div class="assignment-header">
				<div class="header-left">
					<span class="assignment-date">{formatAssignmentDate(assignment.date)}</span>
					{#if assignment.status === 'scheduled'}
						{#if confirmState === 'confirmed'}
							<span class="header-confirmed">
								{m.schedule_confirmed_chip()}
								<span class="health-delta positive">
									<IconBase size="small"><HealthLine /></IconBase>
									+{deltas.confirmedOnTime}
								</span>
							</span>
						{:else if confirmState === 'confirmable' || confirmState === 'not_open'}
							<span class="header-confirm-by">
								{m.schedule_confirm_by_chip({
									date: format(parseISO(assignment.confirmationDeadline), 'MMM d')
								})}
							</span>
						{:else if confirmState === 'overdue'}
							<span class="header-overdue">
								{m.schedule_unconfirmed_chip()}
								<span class="health-delta negative">
									<IconBase size="small"><HealthLine /></IconBase>
									{deltas.unconfirmed}
								</span>
							</span>
						{/if}
					{/if}
				</div>
				<div class="header-right">
					{#if assignment.status === 'scheduled'}
						{#if confirmAction}
							<Button
								variant="ghost"
								size="xs"
								isLoading={isScheduleActionLoading('confirm_shift')}
								onclick={() => handleScheduleAction('confirm_shift', assignment)}
							>
								<IconBase size="small"><CheckCircleIcon /></IconBase>
								{getScheduleActionLabel('confirm_shift')}
							</Button>
						{/if}
						{#if cancelAction}
							<Button
								variant="ghost"
								size="xs"
								isLoading={isScheduleActionLoading('cancel_shift')}
								onclick={() => handleScheduleAction('cancel_shift', assignment)}
							>
								<IconBase size="small"><CalendarX /></IconBase>
								{m.common_cancel()}
							</Button>
						{/if}
					{:else}
						<span class="assignment-status">{statusLabels[assignment.status]}</span>
					{/if}
				</div>
			</div>
			<div class="assignment-meta">
				<Chip
					variant="tag"
					size="xs"
					color="var(--text-muted)"
					label={assignment.routeName}
					icon={routeChipIcon}
				/>
				<Chip
					variant="tag"
					size="xs"
					color="var(--text-muted)"
					label={assignment.warehouseName}
					icon={warehouseChipIcon}
				/>
			</div>
			{#if otherActions.length > 0}
				<div class="assignment-actions">
					{#each otherActions as actionId (actionId)}
						<Button
							variant={getScheduleActionVariant(actionId)}
							size="small"
							isLoading={isScheduleActionLoading(actionId)}
							onclick={() => handleScheduleAction(actionId, assignment)}
						>
							{getScheduleActionLabel(actionId)}
						</Button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/snippet}

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
							<h3 class="section-label">{formatWeekLabel(weekStartDate, false)}</h3>
							<span class="section-range">{formatWeekRange(weekStartDate)}</span>
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
								{@render assignmentRow(assignment)}
							{/each}
						</div>
					{/if}
				</section>

				<section class="schedule-section">
					{#if nextWeekStartDate}
						<div class="section-header">
							<h3 class="section-label">{formatWeekLabel(nextWeekStartDate, true)}</h3>
							<span class="section-range">{formatWeekRange(nextWeekStartDate)}</span>
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
								{@render assignmentRow(assignment)}
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
				<InlineEditor
					id="parcels-start"
					inputType="number"
					inputmode="numeric"
					mode="form"
					hasError={!!startError}
					min="0"
					max="999"
					placeholder={m.shift_start_parcels_placeholder()}
					value={parcelsStart === '' ? '' : String(parcelsStart)}
					onInput={(v) => {
						parcelsStart = v === '' ? '' : Number(v);
						startError = null;
					}}
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
				<InlineEditor
					id="parcels-returned"
					inputType="number"
					inputmode="numeric"
					mode="form"
					hasError={!!completeError}
					min="0"
					max={completeTarget?.shift?.parcelsStart ?? 999}
					placeholder={m.shift_complete_returned_placeholder()}
					value={parcelsReturned === '' ? '' : String(parcelsReturned)}
					onInput={(v) => {
						parcelsReturned = v === '' ? '' : Number(v);
						completeError = null;
					}}
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
		flex: 1;
		background: var(--surface-inset);
	}

	.page-stage {
		max-width: 720px;
		margin: 0 auto;
		padding: var(--spacing-4);
		width: 100%;
	}

	.page-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--spacing-3);
		margin-bottom: var(--spacing-5);
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		padding-left: var(--spacing-2);
	}

	.header-text h1 {
		margin: 0;
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.header-text p {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.loading-state {
		display: flex;
		justify-content: center;
		padding: var(--spacing-8);
	}

	/* Sections */
	.schedule-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-5);
	}

	.schedule-section {
		display: flex;
		flex-direction: column;
	}

	.section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin: 0 0 var(--spacing-2);
		padding: 0 var(--spacing-3);
	}

	.section-label {
		margin: 0;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
	}

	.section-range {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
	}

	/* Assignment items — notification-style layout */
	.assignment-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
	}

	.assignment-item {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		border-radius: var(--radius-lg);
		transition: background 150ms ease;
	}

	.assignment-item:hover {
		background: color-mix(in srgb, var(--text-normal) 4%, transparent);
	}

	.assignment-item.past {
		opacity: 0.55;
	}

	/* Icon circle — tinted with single accent color */
	.icon-circle {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--assignment-accent) 12%, transparent);
		color: var(--assignment-accent);
		flex-shrink: 0;
	}

	.icon-circle.icon-confirmed {
		background: color-mix(in srgb, var(--status-success) 12%, transparent);
		color: var(--status-success);
	}

	.icon-circle.icon-unconfirmed {
		background: color-mix(in srgb, var(--status-warning) 12%, transparent);
		color: var(--status-warning);
	}

	.icon-circle.icon-overdue {
		background: color-mix(in srgb, var(--status-error) 12%, transparent);
		color: var(--status-error);
	}

	.icon-circle :global(svg) {
		width: 20px;
		height: 20px;
	}

	/* Content */
	.assignment-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		min-width: 0;
	}

	.assignment-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-2);
	}

	.header-left {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		flex-shrink: 0;
	}

	.assignment-date {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		line-height: 1.3;
	}

	.assignment-status {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
		flex-shrink: 0;
		font-weight: var(--font-weight-medium);
	}

	.assignment-item.overdue {
		opacity: 0.55;
	}

	.assignment-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1);
		align-items: center;
	}

	.header-confirmed {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--status-success);
		flex-shrink: 0;
	}

	.header-confirm-by {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-xs);
		color: var(--status-warning);
	}

	.header-overdue {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-xs);
		color: var(--status-error);
	}

	/* Health delta indicators */
	.health-delta {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		margin-left: var(--spacing-1);
	}

	.health-delta.positive {
		color: var(--status-success);
	}

	.health-delta.negative {
		color: var(--status-error);
	}

	.assignment-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-1);
	}

	/* Empty state */
	.empty-state {
		text-align: center;
		padding: var(--spacing-6) var(--spacing-4);
		color: var(--text-muted);
	}

	.empty-title {
		margin: 0 0 var(--spacing-1);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.empty-message {
		margin: 0;
		font-size: var(--font-size-sm);
	}

	/* Modals */
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

	/* Mobile */
	@media (max-width: 767px) {
		.page-stage {
			padding: var(--spacing-2);
		}

		.page-header {
			gap: var(--spacing-2);
			margin-bottom: var(--spacing-3);
		}

		.header-text h1 {
			font-size: var(--font-size-lg);
		}

		.assignment-item {
			gap: var(--spacing-2);
			padding: var(--spacing-2);
		}

		.icon-circle {
			width: 28px;
			height: 28px;
		}

		.icon-circle :global(svg) {
			width: 14px;
			height: 14px;
		}

		.modal-actions {
			flex-direction: column;
		}
	}

	@media (pointer: coarse) {
		.assignment-item {
			min-height: 44px;
		}
	}
</style>
