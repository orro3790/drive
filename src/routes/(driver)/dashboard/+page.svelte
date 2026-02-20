<!--
	Driver Dashboard

	Main landing page for drivers showing:
	- Today's shift with multi-step workflow (arrive → inventory → delivering → complete → editable → locked)
	- This week and next week schedule summaries
	- Personal metrics (attendance, completion rates)
	- Pending bids with countdown timers
	- New driver welcome banner

	Design follows schedule/notification-item patterns: flat rows, single accent per status,
	icon anchors, tag chips for metadata.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		differenceInDays,
		format,
		parseISO,
		formatDistanceToNow,
		differenceInMinutes
	} from 'date-fns';
	import type { Component } from 'svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import IconBase from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import IconCircle from '$lib/components/primitives/IconCircle.svelte';
	import InlineEditor from '$lib/components/InlineEditor.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import HealthCard from '$lib/components/driver/HealthCard.svelte';
	import Announcement from '$lib/components/icons/Announcement.svelte';
	import CalendarCheck from '$lib/components/icons/CalendarCheck.svelte';
	import CalendarX from '$lib/components/icons/CalendarX.svelte';
	import HealthLine from '$lib/components/icons/HealthLine.svelte';
	import CheckCircleIcon from '$lib/components/icons/CheckCircleIcon.svelte';
	import CheckInProgress from '$lib/components/icons/CheckInProgress.svelte';
	import CircleCheckFill from '$lib/components/icons/CircleCheckFill.svelte';
	import Gavel from '$lib/components/icons/Gavel.svelte';
	import Pencil from '$lib/components/icons/Pencil.svelte';
	import QuestionMark from '$lib/components/icons/QuestionMark.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';
	import {
		deriveAssignmentLifecycleState,
		getAssignmentActions,
		type AssignmentLifecycleActionId
	} from '$lib/config/driverLifecycleIa';
	import { dispatchPolicy } from '$lib/config/dispatchPolicy';
	import { statusLabels } from '$lib/config/lifecycleLabels';
	import { formatAssignmentDate, formatRouteStartTime } from '$lib/utils/date/formatting';
	import { dashboardStore } from '$lib/stores/dashboardStore.svelte';

	// Cancel modal state
	let cancelTarget = $state<{ id: string; isLateCancel: boolean } | null>(null);

	// Shift start (inventory) state
	let parcelsStart = $state<number | ''>('');
	let startError = $state<string | null>(null);

	// Shift complete state
	let parcelsReturned = $state(0);
	let exceptedReturns = $state(0);
	let exceptionNotes = $state('');
	let completeError = $state<string | null>(null);
	let completeConfirmTarget = $state<{
		assignmentId: string;
		parcelsReturned: number;
		parcelsDelivered: number;
		exceptedReturns: number;
		exceptionNotes: string;
	} | null>(null);

	// Shift edit state
	let isEditing = $state(false);
	let editParcelsStart = $state<number | ''>('');
	let editParcelsReturned = $state<number | ''>(0);
	let editExceptedReturns = $state<number | ''>(0);
	let editExceptionNotes = $state('');
	let editError = $state<string | null>(null);

	// Edit countdown timer
	let editMinutesRemaining = $state(0);
	let dismissedNewDriverBanner = $state(false);

	const NEW_DRIVER_BANNER_DISMISS_KEY = 'drive.dashboard.new-driver-banner.dismissed';
	const lateCancelPenaltyPoints = Math.abs(dispatchPolicy.health.displayDeltas.lateCancel);

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
		// Read tick to force re-computation when store refreshes
		void dashboardStore.tick;
		const shift = dashboardStore.todayShift;
		if (!shift) return null;

		return deriveAssignmentLifecycleState(shift);
	});

	const todayActions = $derived.by(() => {
		// Read tick to force re-computation when store refreshes
		void dashboardStore.tick;
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

	const isTodayShiftCompleted = $derived(
		shiftStep === 'completed-editable' || shiftStep === 'completed-locked'
	);

	const isTodayShiftInProgress = $derived(
		shiftStep === 'inventory' || shiftStep === 'delivering' || shiftStep === 'completing'
	);

	// Derived: accent CSS variable for today's shift icon circle
	const todayShiftAccent = $derived.by((): string => {
		if (isTodayShiftCompleted) {
			return '--status-success';
		}

		if (isTodayShiftInProgress) {
			return '--interactive-accent';
		}

		return '--status-warning';
	});

	// Derived: icon component for today's shift icon circle
	const todayShiftIcon = $derived.by((): Component => {
		return isTodayShiftCompleted ? CircleCheckFill : CheckInProgress;
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

			let intervalId: ReturnType<typeof setInterval> | null = null;
			const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
			const timeoutId = setTimeout(() => {
				updateEditCountdown();
				intervalId = setInterval(updateEditCountdown, 60_000);
			}, msUntilNextMinute);

			return () => {
				clearTimeout(timeoutId);
				if (intervalId) {
					clearInterval(intervalId);
				}
			};
		}
	});

	function formatConfirmDeadline(isoString: string): { overdue: boolean; text: string } {
		const deadline = parseISO(isoString);
		if (deadline < new Date()) {
			return {
				overdue: true,
				text: m.dashboard_confirm_overdue({ deadline: format(deadline, 'MMM d, h:mm a') })
			};
		}
		return {
			overdue: false,
			text: m.dashboard_confirm_deadline({ deadline: formatDistanceToNow(deadline) })
		};
	}

	function formatClosesAt(isoString: string) {
		const date = parseISO(isoString);
		return m.bids_window_closes({
			time: formatDistanceToNow(date, { addSuffix: true })
		});
	}

	function formatTime(isoString: string) {
		return format(parseISO(isoString), 'h:mm a');
	}

	function openCancelModal(assignment: { id: string; isLateCancel: boolean }) {
		cancelTarget = assignment;
	}

	function closeCancelModal() {
		cancelTarget = null;
	}

	async function confirmCancel() {
		if (!cancelTarget) return;
		const success = await dashboardStore.cancel(cancelTarget.id, 'other');
		if (success) {
			closeCancelModal();
		}
	}

	function closeCompleteConfirm() {
		completeConfirmTarget = null;
	}

	function closeCompleteStep() {
		completingStep = false;
		parcelsReturned = 0;
		exceptedReturns = 0;
		exceptionNotes = '';
		completeError = null;
	}

	async function confirmComplete() {
		if (!completeConfirmTarget) {
			return;
		}

		const success = await dashboardStore.completeShift(
			completeConfirmTarget.assignmentId,
			completeConfirmTarget.parcelsReturned,
			completeConfirmTarget.exceptedReturns,
			completeConfirmTarget.exceptionNotes || undefined
		);

		if (success) {
			closeCompleteStep();
			closeCompleteConfirm();
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
		exceptedReturns = 0;
		exceptionNotes = '';
		completeError = null;
		completingStep = true;
	}

	async function submitComplete() {
		const shift = dashboardStore.todayShift;
		if (!shift) return;

		if (!Number.isFinite(parcelsReturned) || parcelsReturned < 0) {
			completeError = m.shift_complete_returned_required();
			return;
		}

		const returnedValue = Math.max(0, Math.trunc(parcelsReturned));

		if (shift.shift?.parcelsStart !== null && returnedValue > (shift.shift?.parcelsStart ?? 0)) {
			completeError = m.shift_complete_returned_exceeds();
			return;
		}

		const exceptedValue = Math.max(0, Math.trunc(exceptedReturns));
		if (exceptedValue > returnedValue) {
			completeError = m.shift_exception_exceeds_returned();
			return;
		}

		if (exceptedValue > 0 && !exceptionNotes.trim()) {
			completeError = m.shift_exception_notes_required();
			return;
		}

		const parcelsStartValue = shift.shift?.parcelsStart ?? 0;
		completeConfirmTarget = {
			assignmentId: shift.id,
			parcelsReturned: returnedValue,
			parcelsDelivered: Math.max(0, parcelsStartValue - returnedValue),
			exceptedReturns: exceptedValue,
			exceptionNotes: exceptionNotes.trim()
		};
	}

	// Edit
	function openEditMode() {
		const shift = dashboardStore.todayShift?.shift;
		if (!shift) return;
		editParcelsStart = shift.parcelsStart ?? '';
		editParcelsReturned = shift.parcelsReturned ?? 0;
		editExceptedReturns = shift.exceptedReturns ?? 0;
		editExceptionNotes = shift.exceptionNotes ?? '';
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
		const er = editExceptedReturns === '' ? undefined : (editExceptedReturns as number);
		const en = editExceptionNotes.trim() || undefined;

		if (ps !== undefined && pr !== undefined && pr > ps) {
			editError = m.shift_complete_returned_exceeds();
			return;
		}

		if (er !== undefined && pr !== undefined && er > pr) {
			editError = m.shift_exception_exceeds_returned();
			return;
		}

		if (er !== undefined && er > 0 && !en) {
			editError = m.shift_exception_notes_required();
			return;
		}

		const success = await dashboardStore.editShift(shift.id, ps, pr, er, en);
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

	const sortedUpcomingShifts = $derived.by(() => {
		// Read tick to force re-computation when store refreshes
		void dashboardStore.tick;
		const thisWeek = dashboardStore.thisWeek?.assignments ?? [];
		const nextWeek = dashboardStore.nextWeek?.assignments ?? [];
		const allAssignments = [...thisWeek, ...nextWeek];
		const todayShiftId = dashboardStore.todayShift?.id;
		const today = format(new Date(), 'yyyy-MM-dd');
		const sevenDaysOut = format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
		// Show shifts in the next 7 days, excluding:
		// - Today's shift (shown separately)
		// - Completed/cancelled shifts
		return allAssignments
			.filter(
				(a) =>
					a.id !== todayShiftId &&
					a.date > today &&
					a.date <= sevenDaysOut &&
					a.status !== 'completed' &&
					a.status !== 'cancelled'
			)
			.sort((a, b) => a.date.localeCompare(b.date));
	});

	onMount(() => {
		loadDismissedBannerPreference();
		dashboardStore.load();
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
				<!-- Health Card -->
				<HealthCard />

				<!-- New Driver Banner -->
				{#if showNewDriverBanner}
					<div class="banner-item" role="note" aria-label={m.dashboard_new_driver_title()}>
						<IconCircle color="--interactive-accent">
							<Announcement />
						</IconCircle>
						<div class="banner-content">
							<div class="banner-header">
								<h3>{m.dashboard_new_driver_title()}</h3>
								<IconButton tooltip={m.common_close()} onclick={dismissNewDriverBanner}>
									<IconBase><XIcon /></IconBase>
								</IconButton>
							</div>
							<p class="banner-message">{m.dashboard_new_driver_message()}</p>
						</div>
					</div>
				{/if}

				<!-- Today's Shift -->
				<section class="dashboard-section">
					<div class="section-header">
						<h2>{m.dashboard_today_section()}</h2>
					</div>

					{#if dashboardStore.todayShift}
						{@const todayShift = dashboardStore.todayShift}
						{@const TodayIcon = todayShiftIcon}
						<div class="today-item">
							<IconCircle color={todayShiftAccent}>
								<TodayIcon />
							</IconCircle>
							<div class="today-content">
								<div class="assignment-header">
									<div class="assignment-when">
										<span class="assignment-date">{formatAssignmentDate(todayShift.date)}</span>
										<span class="assignment-time"
											>{formatRouteStartTime(todayShift.routeStartTime)}</span
										>
									</div>
									{#if todayPrimaryAction && todayPrimaryAction !== 'cancel_shift'}
										{#if todayPrimaryAction === 'edit_completion'}
											<IconButton
												tooltip={getTodayActionLabel(todayPrimaryAction)}
												disabled={dashboardStore.isEditingShift}
												onclick={() => handleTodayAction(todayPrimaryAction)}
												compact
											>
												<IconBase size="small"><Pencil /></IconBase>
											</IconButton>
										{:else if todayPrimaryAction === 'complete_shift'}
											<IconButton
												tooltip={getTodayActionLabel(todayPrimaryAction)}
												disabled={dashboardStore.isCompletingShift}
												onclick={() => handleTodayAction(todayPrimaryAction)}
												compact
											>
												<IconBase size="small"><CheckCircleIcon /></IconBase>
											</IconButton>
										{:else}
											<Button
												variant="ghost"
												size="compact"
												isLoading={isTodayActionLoading(todayPrimaryAction)}
												onclick={() => handleTodayAction(todayPrimaryAction)}
											>
												{getTodayActionLabel(todayPrimaryAction)}
											</Button>
										{/if}
									{:else if isTodayShiftInProgress}
										<Chip
											label={m.route_progress_started()}
											variant="status"
											status="warning"
											size="xs"
										/>
									{:else if todayShift.status === 'completed'}
										<Chip
											label={statusLabels[todayShift.status]}
											variant="status"
											status="success"
											size="xs"
										/>
									{:else}
										<Chip
											label={statusLabels[todayShift.status]}
											variant="status"
											status="neutral"
											size="xs"
										/>
									{/if}
									{#if hasTodayAction('cancel_shift')}
										<IconButton
											tooltip={m.common_cancel()}
											disabled={dashboardStore.isCancelling}
											onclick={() => handleTodayAction('cancel_shift')}
											compact
										>
											<IconBase size="small"><CalendarX /></IconBase>
										</IconButton>
									{/if}
								</div>
								{#if shiftStep === 'delivering' || shiftStep === 'completing'}
									<span class="today-status">
										{m.shift_delivering_status({
											count: String(todayShift.shift?.parcelsStart ?? 0)
										})}
									</span>
								{/if}
								<div class="assignment-meta">
									<Chip
										variant="tag"
										size="xs"
										color="var(--text-muted)"
										label={todayShift.routeName}
										icon={routeChipIcon}
									/>
									<Chip
										variant="tag"
										size="xs"
										color="var(--text-muted)"
										label={todayShift.warehouseName}
										icon={warehouseChipIcon}
									/>
								</div>

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
												{m.shift_arrive_arrived_at({
													time: formatTime(todayShift.shift.arrivedAt)
												})}
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
													value={String(parcelsReturned)}
													onInput={(v) => {
														parcelsReturned = v === '' ? 0 : Number(v);
														completeError = null;
													}}
												/>
												{#if completeError}
													<p class="field-error">{completeError}</p>
												{/if}
											</div>

											{#if parcelsReturned > 0}
												<div class="form-field">
													<label for="excepted-returns">{m.shift_exception_returned_label()}</label>
													<InlineEditor
														id="excepted-returns"
														inputType="number"
														inputmode="numeric"
														mode="form"
														min="0"
														max={parcelsReturned}
														placeholder={m.shift_exception_returned_placeholder()}
														value={String(exceptedReturns)}
														onInput={(v) => {
															exceptedReturns = v === '' ? 0 : Number(v);
															completeError = null;
														}}
													/>
												</div>
												{#if exceptedReturns > 0}
													<div class="form-field">
														<label for="exception-notes">{m.shift_exception_notes_label()}</label>
														<InlineEditor
															id="exception-notes"
															mode="form"
															hasError={!!completeError &&
																completeError === m.shift_exception_notes_required()}
															placeholder={m.shift_exception_notes_placeholder()}
															value={exceptionNotes}
															onInput={(v) => {
																exceptionNotes = v;
																completeError = null;
															}}
														/>
													</div>
												{/if}
											{/if}

											<div class="delivery-summary">
												<p>
													{m.shift_complete_summary_started({
														count: String(todayShift.shift?.parcelsStart ?? 0)
													})}
												</p>
												<p>
													{m.shift_complete_summary_returning({
														count: String(parcelsReturned)
													})}
												</p>
												{#if exceptedReturns > 0}
													<p>
														{m.shift_complete_summary_excepted({
															count: String(exceptedReturns)
														})}
													</p>
												{/if}
												<p class="summary-delivered">
													{m.shift_complete_summary_delivered({
														count: String(
															Math.max(0, (todayShift.shift?.parcelsStart ?? 0) - parcelsReturned)
														)
													})}
												</p>
											</div>

											<div class="complete-actions">
												<Button variant="ghost" size="compact" onclick={closeCompleteStep}>
													{m.common_cancel()}
												</Button>
												<Button
													variant="primary"
													size="compact"
													type="submit"
													isLoading={dashboardStore.isCompletingShift}
												>
													{m.shift_complete_confirm_button()}
												</Button>
											</div>
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
												<div class="form-field">
													<label for="edit-excepted-returns"
														>{m.shift_exception_returned_label()}</label
													>
													<InlineEditor
														id="edit-excepted-returns"
														inputType="number"
														inputmode="numeric"
														mode="form"
														min="0"
														max={typeof editParcelsReturned === 'number'
															? editParcelsReturned
															: 999}
														value={editExceptedReturns === '' ? '' : String(editExceptedReturns)}
														onInput={(v) => {
															editExceptedReturns = v === '' ? '' : Number(v);
															editError = null;
														}}
													/>
												</div>
												{#if (typeof editExceptedReturns === 'number' && editExceptedReturns > 0) || editExceptionNotes}
													<div class="form-field">
														<label for="edit-exception-notes"
															>{m.shift_exception_notes_label()}</label
														>
														<InlineEditor
															id="edit-exception-notes"
															mode="form"
															placeholder={m.shift_exception_notes_placeholder()}
															value={editExceptionNotes}
															onInput={(v) => {
																editExceptionNotes = v;
																editError = null;
															}}
														/>
													</div>
												{/if}
												{#if editError}
													<p class="field-error">{editError}</p>
												{/if}
												<div class="edit-actions">
													<Button variant="ghost" size="compact" onclick={closeEditMode}>
														{m.common_cancel()}
													</Button>
													<Button
														variant="primary"
														size="compact"
														type="submit"
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
												{#if todayShift.shift && todayShift.shift.exceptedReturns > 0}
													<p>
														{m.shift_complete_summary_excepted({
															count: String(todayShift.shift.exceptedReturns)
														})}
													</p>
												{/if}
												<p class="summary-delivered">
													{m.shift_complete_summary_delivered({
														count: String(todayShift.shift?.parcelsDelivered ?? 0)
													})}
												</p>
											</div>
											<p class="edit-countdown">
												{m.shift_edit_window_remaining({ minutes: String(editMinutesRemaining) })}
											</p>
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
											{#if todayShift.shift && todayShift.shift.exceptedReturns > 0}
												<p>
													{m.shift_complete_summary_excepted({
														count: String(todayShift.shift.exceptedReturns)
													})}
												</p>
											{/if}
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
							</div>
						</div>
					{:else}
						<div class="empty-state">
							<p class="empty-title">{m.dashboard_today_no_shift()}</p>
							<p class="empty-message">{m.dashboard_today_no_shift_message()}</p>
						</div>
					{/if}
				</section>

				<!-- This Week's Shifts -->
				{#if sortedUpcomingShifts.length > 0}
					<section class="dashboard-section" id="this-week-shifts">
						<div class="section-header">
							<h2>{m.dashboard_coming_up_section()} ({sortedUpcomingShifts.length})</h2>
						</div>

						<div class="assignment-list">
							{#each sortedUpcomingShifts as shift (shift.id)}
								{@const isConfirmed = !!shift.confirmedAt}
								{@const isConfirmable = shift.isConfirmable}
								{@const daysUntilOpen = differenceInDays(
									parseISO(shift.confirmationOpensAt),
									new Date()
								)}
								{@const confirmInfo = formatConfirmDeadline(shift.confirmationDeadline)}
								{@const deltas = dispatchPolicy.health.displayDeltas}
								<div class="assignment-item">
									{#if isConfirmed}
										<IconCircle color="--status-success">
											<CalendarCheck />
										</IconCircle>
									{:else}
										<IconCircle color="--status-warning">
											<QuestionMark />
										</IconCircle>
									{/if}
									<div class="assignment-content">
										<div class="assignment-header">
											<div class="assignment-when">
												<span class="assignment-date">{formatAssignmentDate(shift.date)}</span>
												<span class="assignment-time"
													>{formatRouteStartTime(shift.routeStartTime)}</span
												>
											</div>
											{#if !isConfirmed && isConfirmable}
												<div class="assignment-actions">
													<IconButton
														tooltip={m.dashboard_confirm_button()}
														disabled={dashboardStore.isConfirming || dashboardStore.isCancelling}
														onclick={() => dashboardStore.confirmShift(shift.id)}
														compact
													>
														<IconBase size="small"><CheckCircleIcon /></IconBase>
													</IconButton>
													<IconButton
														tooltip={m.common_cancel()}
														disabled={dashboardStore.isConfirming || dashboardStore.isCancelling}
														onclick={() => openCancelModal({ id: shift.id, isLateCancel: false })}
														compact
													>
														<IconBase size="small"><CalendarX /></IconBase>
													</IconButton>
												</div>
											{/if}
										</div>
										{#if isConfirmed}
											<span class="header-confirmed">
												{m.schedule_confirmed_chip()}
												<span class="health-delta positive">
													<IconBase size="small"><HealthLine /></IconBase>
													+{deltas.confirmedOnTime}
												</span>
											</span>
										{:else if isConfirmable}
											<span class={confirmInfo.overdue ? 'header-overdue' : 'header-confirm-by'}>
												{confirmInfo.text}
											</span>
										{:else}
											<span class="header-opens-soon">
												{m.schedule_confirm_opens_chip({ days: Math.max(1, daysUntilOpen) })}
											</span>
										{/if}
										<div class="assignment-meta">
											<Chip
												variant="tag"
												size="xs"
												color="var(--text-muted)"
												label={shift.routeName}
												icon={routeChipIcon}
											/>
											<Chip
												variant="tag"
												size="xs"
												color="var(--text-muted)"
												label={shift.warehouseName}
												icon={warehouseChipIcon}
											/>
										</div>
									</div>
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
										<button
											type="button"
											class="day-chip"
											class:completed={assignment.status === 'completed'}
											onclick={() => goto('/schedule')}
										>
											{format(parseISO(assignment.date), 'EEE d')}
										</button>
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
										<button
											type="button"
											class="day-chip"
											class:completed={assignment.status === 'completed'}
											onclick={() => goto('/schedule')}
										>
											{format(parseISO(assignment.date), 'EEE d')}
										</button>
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

				<!-- Pending Bids -->
				<section class="dashboard-section">
					<div class="section-header">
						<h2>{m.dashboard_bids_section()}</h2>
						{#if dashboardStore.pendingBids.length > 0}
							<Button variant="ghost" size="compact" onclick={() => goto('/bids')}>
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
						<div class="assignment-list">
							{#each dashboardStore.pendingBids.slice(0, 3) as bid (bid.id)}
								<div class="assignment-item">
									<IconCircle color="--status-info">
										<Gavel />
									</IconCircle>
									<div class="assignment-content">
										<div class="assignment-header">
											<div class="header-left">
												<div class="assignment-when">
													<span class="assignment-date"
														>{formatAssignmentDate(bid.assignmentDate)}</span
													>
													<span class="assignment-time"
														>{formatRouteStartTime(bid.routeStartTime)}</span
													>
												</div>
												<span class="header-muted">{formatClosesAt(bid.windowClosesAt)}</span>
											</div>
										</div>
										<div class="assignment-meta">
											<Chip
												variant="tag"
												size="xs"
												color="var(--text-muted)"
												label={bid.routeName}
												icon={routeChipIcon}
											/>
											<Chip
												variant="tag"
												size="xs"
												color="var(--text-muted)"
												label={bid.warehouseName}
												icon={warehouseChipIcon}
											/>
										</div>
									</div>
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
	<Modal title={m.schedule_cancel_modal_title()} onClose={closeCancelModal}>
		<div class="confirm-modal-copy-stack">
			<p class="confirm-modal-copy">{m.schedule_cancel_modal_copy()}</p>
			{#if cancelTarget.isLateCancel}
				<p class="confirm-modal-penalty">
					{m.schedule_cancel_modal_late_penalty({
						points: String(lateCancelPenaltyPoints)
					})}
				</p>
			{/if}
			<div class="confirm-modal-actions">
				<Button variant="ghost" size="compact" onclick={closeCancelModal}>
					{m.common_cancel()}
				</Button>
				<Button
					variant="danger"
					size="compact"
					isLoading={dashboardStore.isCancelling}
					onclick={confirmCancel}
				>
					{m.schedule_cancel_confirm_button()}
				</Button>
			</div>
		</div>
	</Modal>
{/if}

{#if completeConfirmTarget}
	<Modal title={m.shift_complete_modal_title()} onClose={closeCompleteConfirm}>
		<div class="confirm-modal-copy-stack">
			<p class="confirm-modal-copy">
				{m.shift_complete_modal_confirm_copy({
					returns: String(completeConfirmTarget.parcelsReturned),
					delivered: String(completeConfirmTarget.parcelsDelivered)
				})}
			</p>
			<div class="confirm-modal-actions">
				<Button variant="ghost" size="compact" onclick={closeCompleteConfirm}>
					{m.common_cancel()}
				</Button>
				<Button
					variant="primary"
					size="compact"
					isLoading={dashboardStore.isCompletingShift}
					onclick={confirmComplete}
				>
					{m.shift_complete_confirm_button()}
				</Button>
			</div>
		</div>
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

	.dashboard-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-5);
	}

	.dashboard-section {
		display: flex;
		flex-direction: column;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 var(--spacing-3);
		margin-bottom: var(--spacing-2);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-sm);
	}

	/* New Driver Banner — flat row with icon circle */
	.banner-item {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		border-radius: var(--radius-lg);
	}

	.banner-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
		min-width: 0;
	}

	.banner-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-2);
	}

	.banner-header h3 {
		margin: 0;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.banner-message {
		margin: 0;
		font-size: var(--font-size-sm);
		line-height: 1.5;
		color: var(--text-muted);
	}

	/* Today's Shift — icon-circle grid layout */
	.today-item {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--spacing-3);
		padding: var(--spacing-3);
		border-radius: var(--radius-lg);
		transition: background 150ms ease;
	}

	.today-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		min-width: 0;
	}

	/* Shared assignment layout (confirmations, bids) */
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
	}

	.assignment-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		min-width: 0;
	}

	.assignment-header {
		display: flex;
		align-items: flex-start;
		gap: var(--spacing-2);
	}

	.assignment-header .assignment-when {
		margin-right: auto;
	}

	.assignment-actions {
		display: inline-flex;
		align-items: flex-start;
		gap: 2px;
	}

	.assignment-when {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.assignment-date {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		line-height: 1.3;
	}

	.assignment-time {
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-muted);
		line-height: 1.2;
	}

	.assignment-status {
		font-size: var(--font-size-xs);
		color: var(--text-faint);
		font-weight: var(--font-weight-medium);
	}

	.today-status {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.header-confirm-by {
		font-size: var(--font-size-xs);
		color: var(--status-warning);
	}

	.header-overdue {
		font-size: var(--font-size-xs);
		color: var(--status-error);
	}

	.header-confirmed {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--status-success);
	}

	.header-opens-soon {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

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

	.header-muted {
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.assignment-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-1);
		align-items: center;
	}

	.today-content > .assignment-meta {
		margin-bottom: var(--spacing-1);
	}

	/* Step Content */
	.step-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
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
		border: none;
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
		text-align: left;
	}

	.edit-locked {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
		text-align: left;
	}

	.edit-actions {
		display: flex;
		gap: var(--spacing-2);
		justify-content: flex-end;
	}

	.complete-actions {
		display: flex;
		gap: var(--spacing-2);
		justify-content: flex-end;
	}

	.confirm-modal-copy-stack {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.confirm-modal-copy {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		line-height: 1.5;
	}

	.confirm-modal-penalty {
		margin: 0;
		font-size: var(--font-size-sm);
		line-height: 1.5;
		color: var(--status-warning);
	}

	.confirm-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-2);
	}

	/* Empty States */
	.empty-state {
		padding: var(--spacing-1) var(--spacing-3);
	}

	.empty-state.compact {
		padding: var(--spacing-1) var(--spacing-3);
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
		padding: 0 var(--spacing-3);
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
		display: inline-flex;
		align-items: center;
		padding: 2px var(--spacing-2);
		border: none;
		border-radius: var(--radius-full);
		background: var(--interactive-normal);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
		cursor: pointer;
		transition: background 150ms ease;
	}

	.day-chip:hover {
		background: var(--interactive-hover);
	}

	.day-chip.completed {
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		color: var(--status-success);
	}

	.day-chip.completed:hover {
		background: color-mix(in srgb, var(--status-success) 25%, transparent);
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

		.today-item,
		.assignment-item {
			gap: var(--spacing-2);
			padding: var(--spacing-3);
		}

		.week-row {
			grid-template-columns: 1fr;
		}
	}

	@media (pointer: coarse) {
		.today-item,
		.assignment-item {
			min-height: 44px;
		}
	}
</style>
