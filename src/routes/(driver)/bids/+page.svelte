<!--
	Driver Bids Page

	Displays available bid windows and driver's submitted bids.
	Emergency routes are visually distinct with green accent and bonus badge.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { format, parseISO, formatDistanceToNow } from 'date-fns';
	import Button from '$lib/components/primitives/Button.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import Lightning from '$lib/components/icons/Lightning.svelte';
	import { getBidWindowPrimaryAction } from '$lib/config/driverLifecycleIa';
	import { bidsStore, type BidStatus } from '$lib/stores/bidsStore.svelte';

	const statusLabels: Record<BidStatus, string> = {
		pending: m.bids_status_pending(),
		won: m.bids_status_won(),
		lost: m.bids_status_lost()
	};

	const statusChips: Record<BidStatus, 'info' | 'success' | 'warning' | 'error' | 'neutral'> = {
		pending: 'info',
		won: 'success',
		lost: 'neutral'
	};

	function formatAssignmentDate(dateString: string) {
		return format(parseISO(dateString), 'EEE, MMM d');
	}

	function formatClosesAt(isoString: string) {
		const date = parseISO(isoString);
		return m.bids_window_closes({
			time: formatDistanceToNow(date, { addSuffix: true })
		});
	}

	function formatSubmittedAt(isoString: string) {
		const date = parseISO(isoString);
		return m.bids_submitted_at({
			time: formatDistanceToNow(date, { addSuffix: true })
		});
	}

	async function handleSubmitBid(assignmentId: string) {
		await bidsStore.submitBid(assignmentId);
	}

	function getBidActionLabel(mode: 'competitive' | 'instant' | 'emergency') {
		const actionId = getBidWindowPrimaryAction({ mode });
		return actionId === 'submit_bid' ? m.bids_submit_button() : m.bids_accept_button();
	}

	onMount(() => {
		bidsStore.loadAll();
	});
</script>

<svelte:head>
	<title>{m.bids_page_title()} | Drive</title>
</svelte:head>

<div class="page-surface">
	<div class="page-stage">
		<div class="page-header">
			<div class="header-text">
				<h1>{m.bids_page_title()}</h1>
				<p>{m.bids_page_description()}</p>
			</div>
		</div>

		{#if bidsStore.isLoadingAvailable && bidsStore.isLoadingMyBids}
			<div class="loading-state">
				<Spinner size={24} label={m.bids_loading_label()} />
			</div>
		{:else}
			<div class="bids-sections">
				<!-- Available Bids Section -->
				<section class="bids-section">
					<div class="section-header">
						<h2>{m.bids_available_section()}</h2>
					</div>

					{#if bidsStore.isLoadingAvailable}
						<div class="loading-state">
							<Spinner size={20} label={m.bids_loading_label()} />
						</div>
					{:else if bidsStore.availableWindows.length === 0}
						<div class="empty-state">
							<p class="empty-title">{m.bids_available_empty_title()}</p>
							<p class="empty-message">{m.bids_available_empty_message()}</p>
						</div>
					{:else}
						<div class="bid-list">
							{#each bidsStore.availableWindows as window (window.id)}
								{@const isEmergency = window.mode === 'emergency'}
								<div class="bid-card" class:emergency={isEmergency}>
									<div class="card-header">
										<div class="card-summary">
											{#if isEmergency}
												<div class="emergency-label">
													<Lightning stroke="var(--status-success)" />
													<span>{m.bids_emergency_label()}</span>
												</div>
											{/if}
											<p class="bid-date">{formatAssignmentDate(window.assignmentDate)}</p>
											<p class="bid-route">{window.routeName}</p>
											<p class="bid-warehouse">{window.warehouseName}</p>
										</div>
										<div class="card-meta">
											{#if isEmergency && window.payBonusPercent > 0}
												<Chip
													variant="status"
													status="success"
													label={m.bids_emergency_bonus({ bonus: window.payBonusPercent })}
													size="xs"
												/>
											{/if}
											{#if !isEmergency}
												<p class="closes-at">{formatClosesAt(window.closesAt)}</p>
											{:else}
												<p class="closes-at">{m.bids_emergency_first_come()}</p>
											{/if}
										</div>
									</div>
									<div class="card-actions">
										<Button
											variant="primary"
											size="small"
											onclick={() => handleSubmitBid(window.assignmentId)}
											isLoading={bidsStore.isSubmitting(window.assignmentId)}
											disabled={bidsStore.submittingAssignmentId !== null}
										>
											{getBidActionLabel(window.mode)}
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<!-- My Bids Section -->
				<section class="bids-section">
					<div class="section-header">
						<h2>{m.bids_my_section()}</h2>
					</div>

					{#if bidsStore.isLoadingMyBids}
						<div class="loading-state">
							<Spinner size={20} label={m.bids_loading_label()} />
						</div>
					{:else if bidsStore.myBids.length === 0}
						<div class="empty-state">
							<p class="empty-title">{m.bids_my_empty_title()}</p>
							<p class="empty-message">{m.bids_my_empty_message()}</p>
						</div>
					{:else}
						<div class="bid-list">
							{#each bidsStore.myBids as bid (bid.id)}
								<div class="bid-card" class:resolved={bid.status !== 'pending'}>
									<div class="card-header">
										<div class="card-summary">
											<p class="bid-date">{formatAssignmentDate(bid.assignmentDate)}</p>
											<p class="bid-route">{bid.routeName}</p>
											<p class="bid-warehouse">{bid.warehouseName}</p>
										</div>
										<Chip
											variant="status"
											status={statusChips[bid.status]}
											label={statusLabels[bid.status]}
											size="xs"
										/>
									</div>
									<div class="card-footer">
										<p class="submitted-at">{formatSubmittedAt(bid.bidAt)}</p>
										{#if bid.status === 'pending'}
											<p class="closes-at">{formatClosesAt(bid.windowClosesAt)}</p>
										{/if}
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

	.bids-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-6);
	}

	.bids-section {
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-4);
		box-shadow: var(--shadow-sm);
	}

	.section-header {
		margin-bottom: var(--spacing-3);
	}

	.section-header h2 {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.empty-state {
		padding: var(--spacing-4);
		border-radius: var(--radius-base);
		background: var(--surface-secondary);
		border: 1px dashed var(--border-primary);
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

	.bid-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.bid-card {
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-base);
		padding: var(--spacing-3);
		background: var(--surface-secondary);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.bid-card.emergency {
		border: 2px solid var(--status-success);
		background: color-mix(in srgb, var(--status-success) 4%, var(--surface-secondary));
	}

	.bid-card.resolved {
		opacity: 0.7;
	}

	.emergency-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--status-success);
		margin-bottom: var(--spacing-1);
	}

	.emergency-label :global(svg) {
		width: 16px;
		height: 16px;
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

	.bid-date {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-semibold);
		color: var(--text-normal);
	}

	.bid-route {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-normal);
	}

	.bid-warehouse {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.card-meta {
		text-align: right;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--spacing-1);
	}

	.closes-at {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}

	.card-actions {
		display: flex;
		justify-content: flex-end;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.submitted-at {
		margin: 0;
		font-size: var(--font-size-xs);
		color: var(--text-muted);
	}
</style>
