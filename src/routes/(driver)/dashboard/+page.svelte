<!--
	Driver Dashboard

	Main landing page for drivers showing:
	- Today's shift with multi-step workflow (arrive → inventory → delivering → complete → editable → locked)
	- This week and next week schedule summaries
	- Personal metrics (attendance, completion rates)
	- Pending bids with countdown timers
	- New driver welcome banner
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { format, parseISO, formatDistanceToNow, differenceInMinutes } from 'date-fns';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import CancelShiftModal from '$lib/components/driver/CancelShiftModal.svelte';
	import HealthCard from '$lib/components/driver/HealthCard.svelte';
	import Announcement from '$lib/components/icons/Announcement.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';
	import {
		deriveAssignmentLifecycleState,
		getAssignmentActions,
		type AssignmentLifecycleActionId
	} from '$lib/config/driverLifecycleIa';
	import { statusLabels, statusChipVariants } from '$lib/config/lifecycleLabels';
	import { formatAssignmentDate } from '$lib/utils/date/formatting';
	import { dashboardStore, type DashboardAssignment } from '$lib/stores/dashboardStore.svelte';
	import type { CancelReason } from '$lib/schemas/assignment';

	// Cancel modal state
	let cancelTarget = $state<DashboardAssignment | null>(null);

	// Shift start (inventory) state
	let parcelsStart = $state<number | ''>('');
	let startError = $state<string | null>(null);

	// Shift complete state
	let parcelsReturned = $state<number | ''>(0);
	let completeError = $state<string | null>(null);

	// Shift edit state
	let isEditing = $state(false);
	let editParcelsStart = $state<number | ''>('');
	let editParcelsReturned = $state<number | ''>(0);
	let editError = $state<string | null>(null);

	// Edit countdown timer
	let editMinutesRemaining = $state(0);
	let dismissedNewDriverBanner = $state(false);
	let metricsExpanded = $state(false);

	const NEW_DRIVER_BANNER_DISMISS_KEY = 'drive.dashboard.new-driver-banner.dismissed';

	type ShiftStep =
		| 'arrive'
		| 'inventory'
		| 'delivering'
		| 'completing'
		| 'completed-editable'
		| 'completed-locked'
		| null;

	type DashboardActionId = Extract<
		AssignmentLifecycleActionId,
		| 'confirm_shift'
		| 'arrive_on_site'
		| 'record_inventory'
		| 'complete_shift'
		| 'edit_completion'
		| 'cancel_shift'
	>;

	let completingStep = $state(false);

	const todayLifecycleState = $derived.by(() => {
		const shift = dashboardStore.todayShift;
		if (!shift) return null;

		return deriveAssignmentLifecycleState(shift);
	});

	const todayActions = $derived.by(() => {
		const shift = dashboardStore.todayShift;
		if (!shift) {
			return [] as DashboardActionId[];
		}

		return getAssignmentActions(shift, 'dashboard').filter(
			(actionId): actionId is DashboardActionId =>
				actionId === 'confirm_shift' ||
				actionId === 'arrive_on_site' ||
				actionId === 'record_inventory' ||
				actionId === 'complete_shift' ||
				actionId === 'edit_completion' ||
				actionId === 'cancel_shift'
		);
	});

	function hasTodayAction(actionId: DashboardActionId) {
		return todayActions.includes(actionId);
	}

	const showNewDriverBanner = $derived(dashboardStore.isNewDriver && !dismissedNewDriverBanner);

	const todayPrimaryAction = $derived.by(() => {
		const firstNonCancel = todayActions.find((actionId) => actionId !== 'cancel_shift');
		if (firstNonCancel) {
			return firstNonCancel;
		}

		return todayActions.includes('cancel_shift') ? 'cancel_shift' : null;
	});

	function getTodayActionLabel(actionId: DashboardActionId) {
		switch (actionId) {
			case 'confirm_shift':
				return m.dashboard_confirm_button();
			case 'arrive_on_site':
				return m.shift_arrive_button();
			case 'record_inventory':
				return m.shift_start_button();
			case 'complete_shift':
				return m.shift_complete_button();
			case 'edit_completion':
				return m.shift_edit_button();
			case 'cancel_shift':
				return m.schedule_cancel_button();
		}
	}

	function getTodayActionVariant(actionId: DashboardActionId): 'primary' | 'secondary' | 'danger' {
		return actionId === 'cancel_shift' ? 'danger' : 'primary';
	}

	function isTodayActionLoading(actionId: DashboardActionId): boolean {
		switch (actionId) {
			case 'confirm_shift':
				return dashboardStore.isConfirming;
			case 'arrive_on_site':
				return dashboardStore.isArriving;
			case 'record_inventory':
				return dashboardStore.isStartingShift;
			case 'complete_shift':
				return dashboardStore.isCompletingShift;
			case 'edit_completion':
				return dashboardStore.isEditingShift;
			case 'cancel_shift':
				return dashboardStore.isCancelling;
		}
	}

	function handleTodayAction(actionId: DashboardActionId) {
		const shift = dashboardStore.todayShift;
		if (!shift) {
			return;
		}

		switch (actionId) {
			case 'confirm_shift':
				dashboardStore.confirmShift(shift.id);
				return;
			case 'arrive_on_site':
				handleArrive();
				return;
			case 'record_inventory':
				return;
			case 'complete_shift':
				openCompleteStep();
				return;
			case 'edit_completion':
				openEditMode();
				return;
			case 'cancel_shift':
				openCancelModal(shift);
				return;
		}
	}

	const shiftStep: ShiftStep = $derived.by(() => {
		switch (todayLifecycleState) {
			case 'scheduled_today_arrive':
				return 'arrive';
			case 'active_inventory':
				return 'inventory';
			case 'active_delivering':
				return completingStep ? 'completing' : 'delivering';
			case 'completed_editable':
				return 'completed-editable';
			case 'completed_locked':
				return 'completed-locked';
			default:
				return null;
		}
	});

	function updateEditCountdown() {
		const shift = dashboardStore.todayShift;
		if (shift?.shift?.editableUntil) {
			const remaining = differenceInMinutes(new Date(shift.shift.editableUntil), new Date());
			editMinutesRemaining = Math.max(0, remaining);
		}
	}

	$effect(() => {
		if (shiftStep === 'completed-editable') {
			updateEditCountdown();
			const timer = setInterval(updateEditCountdown, 30_000);
			return () => clearInterval(timer);
		}
	});

	function formatClosesAt(isoString: string) {
		const date = parseISO(isoString);
		return m.bids_window_closes({
			time: formatDistanceToNow(date, { addSuffix: true })
		});
	}

	function formatPercentage(rate: number) {
		return `${Math.round(rate * 100)}%`;
	}

	function formatTime(isoString: string) {
		return format(parseISO(isoString), 'h:mm a');
	}

	function openCancelModal(assignment: DashboardAssignment) {
		cancelTarget = assignment;
	}

	function closeCancelModal() {
		cancelTarget = null;
	}

	async function handleCancel(reason: CancelReason) {
		if (!cancelTarget) return;
		const success = await dashboardStore.cancel(cancelTarget.id, reason);
		if (success) {
			closeCancelModal();
		}
	}

	// Arrive
	async function handleArrive() {
		const shift = dashboardStore.todayShift;
		if (!shift) return;
		await dashboardStore.arrive(shift.id);
	}

	// Start (inventory submission)
	async function submitInventory() {
		const shift = dashboardStore.todayShift;
		if (!shift) return;
		if (parcelsStart === '' || parcelsStart < 1) {
			startError = m.shift_start_parcels_required();
			return;
		}

		const success = await dashboardStore.startShift(shift.id, parcelsStart);
		if (success) {
			parcelsStart = '';
			startError = null;
		}
	}

	// Complete
	function openCompleteStep() {
		parcelsReturned = 0;
		completeError = null;
		completingStep = true;
	}

	async function submitComplete() {
		const shift = dashboardStore.todayShift;
		if (!shift) return;
		if (parcelsReturned === '') {
			completeError = m.shift_complete_returned_required();
			return;
		}

		const returnedValue = typeof parcelsReturned === 'number' ? parcelsReturned : 0;

		if (shift.shift?.parcelsStart !== null && returnedValue > (shift.shift?.parcelsStart ?? 0)) {
			completeError = m.shift_complete_returned_exceeds();
			return;
		}

		const success = await dashboardStore.completeShift(shift.id, returnedValue);
		if (success) {
			completingStep = false;
			parcelsReturned = 0;
			completeError = null;
		}
	}

	// Edit
	function openEditMode() {
		const shift = dashboardStore.todayShift?.shift;
		if (!shift) return;
		editParcelsStart = shift.parcelsStart ?? '';
		editParcelsReturned = shift.parcelsReturned ?? 0;
		editError = null;
		isEditing = true;
	}

	function closeEditMode() {
		isEditing = false;
		editError = null;
	}

	async function submitEdit() {
		const shift = dashboardStore.todayShift;
		if (!shift) return;

		const ps = editParcelsStart === '' ? undefined : editParcelsStart;
		const pr = editParcelsReturned === '' ? undefined : (editParcelsReturned as number);

		if (ps !== undefined && pr !== undefined && pr > ps) {
			editError = m.shift_complete_returned_exceeds();
			return;
		}

		const success = await dashboardStore.editShift(shift.id, ps, pr);
		if (success) {
			isEditing = false;
			editError = null;
		}
	}

	function loadDismissedBannerPreference() {
		const storedPreference = window.localStorage.getItem(NEW_DRIVER_BANNER_DISMISS_KEY);
		dismissedNewDriverBanner = storedPreference === '1';
	}

	function dismissNewDriverBanner() {
		dismissedNewDriverBanner = true;
		window.localStorage.setItem(NEW_DRIVER_BANNER_DISMISS_KEY, '1');
	}

	onMount(() => {
		loadDismissedBannerPreference();
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
				{#if showNewDriverBanner}
					<div class="welcome-banner" role="note" aria-label={m.dashboard_new_driver_title()}>
						<div class="welcome-banner-header">
							<div class="welcome-banner-intro">
								<Icon><Announcement /></Icon>
								<h3>{m.dashboard_new_driver_title()}</h3>
							</div>
							<IconButton tooltip={m.common_close()} onclick={dismissNewDriverBanner}>
								<Icon><XIcon /></Icon>
							</IconButton>
						</div>
						<p class="welcome-banner-message">{m.dashboard_new_driver_message()}</p>
					</div>
				{/if}

				<!-- Health Card -->
				<HealthCard />

				<!-- Today's Shift -->
				<section class="dashboard-section">
					<div class="section-header">
						<h2>{m.dashboard_today_section()}</h2>
					</div>

					{#if dashboardStore.todayShift}
						{@const todayShift = dashboardStore.todayShift}
						<div class="today-card">
							<div class="card-header">
								<div class="card-summary">
									<p class="today-date">{formatAssignmentDate(todayShift.date)}</p>
									<p class="today-route">{todayShift.routeName}</p>
									<p class="today-warehouse">{todayShift.warehouseName}</p>
								</div>
								<Chip
									variant="status"
									status={statusChipVariants[todayShift.status]}
									label={statusLabels[todayShift.status]}
									size="xs"
								/>
							</div>

							{#if todayPrimaryAction}
								<div class="next-action-strip">
									<p class="next-action-label">{m.common_actions()}</p>
									<p class="next-action-value">{getTodayActionLabel(todayPrimaryAction)}</p>
								</div>
							{/if}

							<!-- Step 1: Arrive -->
							{#if shiftStep === 'arrive'}
								<div class="step-content">
									{#if hasTodayAction('arrive_on_site')}
										<Button
											variant={getTodayActionVariant('arrive_on_site')}
											fill
											isLoading={isTodayActionLoading('arrive_on_site')}
											onclick={() => handleTodayAction('arrive_on_site')}
										>
											{getTodayActionLabel('arrive_on_site')}
										</Button>
									{/if}
								</div>
							{/if}

							<!-- Step 2: Inventory -->
							{#if shiftStep === 'inventory'}
								<div class="step-content">
									{#if todayShift.shift?.arrivedAt}
										<p class="step-info">
											{m.shift_arrive_arrived_at({ time: formatTime(todayShift.shift.arrivedAt) })}
										</p>
									{/if}
									<form
										class="inline-form"
										onsubmit={(e) => {
											e.preventDefault();
											submitInventory();
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
												min="1"
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
										<Button
											variant="primary"
											type="submit"
											fill
											isLoading={dashboardStore.isStartingShift}
										>
											{m.shift_start_button()}
										</Button>
									</form>
								</div>
							{/if}

							<!-- Step 3: Delivering -->
							{#if shiftStep === 'delivering'}
								<div class="step-content">
									<p class="step-status">{m.shift_delivering_status()}</p>
									<p class="step-info">
										{m.shift_delivering_parcels({
											count: String(todayShift.shift?.parcelsStart ?? 0)
										})}
									</p>
									{#if hasTodayAction('complete_shift')}
										<Button
											variant={getTodayActionVariant('complete_shift')}
											fill
											onclick={() => handleTodayAction('complete_shift')}
										>
											{getTodayActionLabel('complete_shift')}
										</Button>
									{/if}
								</div>
							{/if}

							<!-- Step 4: Completing (returns entry) -->
							{#if shiftStep === 'completing'}
								<div class="step-content">
									<form
										class="inline-form"
										onsubmit={(e) => {
											e.preventDefault();
											submitComplete();
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
												max={todayShift.shift?.parcelsStart ?? 999}
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

										<div class="delivery-summary">
											<p>
												{m.shift_complete_summary_started({
													count: String(todayShift.shift?.parcelsStart ?? 0)
												})}
											</p>
											<p>
												{m.shift_complete_summary_returning({
													count: String(typeof parcelsReturned === 'number' ? parcelsReturned : 0)
												})}
											</p>
											<p class="summary-delivered">
												{m.shift_complete_summary_delivered({
													count: String(
														(todayShift.shift?.parcelsStart ?? 0) -
															(typeof parcelsReturned === 'number' ? parcelsReturned : 0)
													)
												})}
											</p>
										</div>

										<Button
											variant="primary"
											type="submit"
											fill
											isLoading={dashboardStore.isCompletingShift}
										>
											{m.shift_complete_confirm_button()}
										</Button>
									</form>
								</div>
							{/if}

							<!-- Step 5: Completed (editable) -->
							{#if shiftStep === 'completed-editable'}
								<div class="step-content">
									{#if isEditing}
										<form
											class="inline-form"
											onsubmit={(e) => {
												e.preventDefault();
												submitEdit();
											}}
										>
											<div class="form-field">
												<label for="edit-parcels-start">{m.shift_start_parcels_label()}</label>
												<InlineEditor
													id="edit-parcels-start"
													inputType="number"
													inputmode="numeric"
													mode="form"
													hasError={!!editError}
													min="1"
													max="999"
													value={editParcelsStart === '' ? '' : String(editParcelsStart)}
													onInput={(v) => {
														editParcelsStart = v === '' ? '' : Number(v);
														editError = null;
													}}
												/>
											</div>
											<div class="form-field">
												<label for="edit-parcels-returned"
													>{m.shift_complete_returned_label()}</label
												>
												<InlineEditor
													id="edit-parcels-returned"
													inputType="number"
													inputmode="numeric"
													mode="form"
													hasError={!!editError}
													min="0"
													max={typeof editParcelsStart === 'number' ? editParcelsStart : 999}
													value={editParcelsReturned === '' ? '' : String(editParcelsReturned)}
													onInput={(v) => {
														editParcelsReturned = v === '' ? '' : Number(v);
														editError = null;
													}}
												/>
											</div>
											{#if editError}
												<p class="field-error">{editError}</p>
											{/if}
											<div class="edit-actions">
												<Button variant="secondary" fill onclick={closeEditMode}>
													{m.common_cancel()}
												</Button>
												<Button
													variant="primary"
													type="submit"
													fill
													isLoading={dashboardStore.isEditingShift}
												>
													{m.common_save()}
												</Button>
											</div>
										</form>
									{:else}
										<div class="delivery-summary">
											<p>
												{m.shift_complete_summary_started({
													count: String(todayShift.shift?.parcelsStart ?? 0)
												})}
											</p>
											<p>
												{m.shift_complete_summary_returning({
													count: String(todayShift.shift?.parcelsReturned ?? 0)
												})}
											</p>
											<p class="summary-delivered">
												{m.shift_complete_summary_delivered({
													count: String(todayShift.shift?.parcelsDelivered ?? 0)
												})}
											</p>
										</div>
										<p class="edit-countdown">
											{m.shift_edit_window_remaining({ minutes: String(editMinutesRemaining) })}
										</p>
										{#if hasTodayAction('edit_completion')}
											<Button
												variant="secondary"
												fill
												onclick={() => handleTodayAction('edit_completion')}
											>
												{getTodayActionLabel('edit_completion')}
											</Button>
										{/if}
									{/if}
								</div>
							{/if}

							<!-- Step 6: Completed (locked) -->
							{#if shiftStep === 'completed-locked'}
								<div class="step-content">
									<div class="delivery-summary">
										<p>
											{m.shift_complete_summary_started({
												count: String(todayShift.shift?.parcelsStart ?? 0)
											})}
										</p>
										<p>
											{m.shift_complete_summary_returning({
												count: String(todayShift.shift?.parcelsReturned ?? 0)
											})}
										</p>
										<p class="summary-delivered">
											{m.shift_complete_summary_delivered({
												count: String(todayShift.shift?.parcelsDelivered ?? 0)
											})}
										</p>
									</div>
									<p class="edit-locked">{m.shift_edit_contact_manager()}</p>
								</div>
							{/if}

							{#if shiftStep === null && todayPrimaryAction && todayPrimaryAction !== 'cancel_shift'}
								<div class="step-content">
									<Button
										variant={getTodayActionVariant(todayPrimaryAction)}
										fill
										isLoading={isTodayActionLoading(todayPrimaryAction)}
										onclick={() => handleTodayAction(todayPrimaryAction)}
									>
										{getTodayActionLabel(todayPrimaryAction)}
									</Button>
								</div>
							{/if}

							<!-- Cancel button (available in early steps) -->
							{#if hasTodayAction('cancel_shift')}
								<div class="card-actions">
									<Button
										variant={getTodayActionVariant('cancel_shift')}
										size="small"
										isLoading={isTodayActionLoading('cancel_shift')}
										onclick={() => handleTodayAction('cancel_shift')}
									>
										{getTodayActionLabel('cancel_shift')}
									</Button>
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

				<!-- Raw Metrics (collapsible) -->
				<section class="dashboard-section metrics-section">
					<button
						type="button"
						class="metrics-toggle"
						onclick={() => (metricsExpanded = !metricsExpanded)}
						aria-expanded={metricsExpanded}
						aria-controls="metrics-content"
					>
						<h2>{m.dashboard_metrics_section()}</h2>
						<span class="toggle-label">
							{metricsExpanded ? m.dashboard_metrics_hide() : m.dashboard_metrics_show()}
						</span>
					</button>

					{#if metricsExpanded}
						<div id="metrics-content" class="metrics-grid">
							<div class="metric-card">
								<p class="metric-value">
									{formatPercentage(dashboardStore.metrics.attendanceRate)}
								</p>
								<p class="metric-label">{m.dashboard_metrics_attendance()}</p>
							</div>
							<div class="metric-card">
								<p class="metric-value">
									{formatPercentage(dashboardStore.metrics.completionRate)}
								</p>
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
					{/if}
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

{#if cancelTarget}
	<CancelShiftModal
		isLateCancel={cancelTarget.isLateCancel}
		isLoading={dashboardStore.isCancelling}
		onCancel={handleCancel}
		onClose={closeCancelModal}
	/>
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
		font-weight: var(--font-weight-medium);
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
		box-shadow: var(--shadow-base);
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
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	/* New Driver Banner */
	.welcome-banner {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		padding: var(--spacing-3) var(--spacing-4);
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-base);
	}

	.welcome-banner-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-2);
	}

	.welcome-banner-intro {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		min-width: 0;
		color: var(--text-normal);
	}

	.welcome-banner-intro h3 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.welcome-banner-message {
		margin: 0;
		font-size: var(--font-size-sm);
		line-height: 1.5;
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

	.next-action-strip {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-2) var(--spacing-3);
		border-radius: var(--radius-base);
		background: color-mix(in srgb, var(--interactive-accent) 10%, var(--surface-primary));
		border: 1px solid color-mix(in srgb, var(--interactive-accent) 30%, var(--border-primary));
	}

	.next-action-label {
		margin: 0;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.next-action-value {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
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
		font-weight: var(--font-weight-medium);
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

	/* Step Content */
	.step-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.step-status {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--interactive-accent);
	}

	.step-info {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	/* Inline Form */
	.inline-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	/* Delivery Summary */
	.delivery-summary {
		padding: var(--spacing-3);
		border-radius: var(--radius-base);
		background: var(--surface-primary);
		border: 1px solid var(--border-primary);
	}

	.delivery-summary p {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.6;
	}

	.delivery-summary .summary-delivered {
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	/* Edit */
	.edit-countdown {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		text-align: center;
	}

	.edit-locked {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		text-align: center;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-2);
	}

	/* Empty States */
	.empty-state {
		padding: var(--spacing-4);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		border: none;
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

	/* Metrics (collapsible) */
	.metrics-section {
		padding: 0;
	}

	.metrics-toggle {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		padding: var(--spacing-3) var(--spacing-4);
		background: none;
		border: none;
		cursor: pointer;
		border-radius: var(--radius-lg);
		transition: background var(--transition-duration-100) var(--transition-ease);
	}

	.metrics-toggle:hover {
		background: var(--interactive-hover);
	}

	.metrics-toggle h2 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
	}

	.toggle-label {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--spacing-2);
		padding: 0 var(--spacing-4) var(--spacing-3);
	}

	.metric-card {
		padding: var(--spacing-2);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		text-align: center;
	}

	.metric-value {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
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

	/* Form Styles */
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

	/* Responsive */
	@media (max-width: 767px) {
		.dashboard-section {
			padding: 0;
		}

		.week-row {
			grid-template-columns: 1fr;
		}

		.metrics-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
