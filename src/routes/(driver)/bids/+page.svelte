<!--
	Driver Bids Page

	Displays available bid windows and driver's submitted bids.
	Design follows dashboard/schedule/notification-item patterns: flat rows,
	single accent per status, icon anchors, tag chips for metadata.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { parseISO, formatDistanceToNow } from 'date-fns';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Chip from '$lib/components/primitives/Chip.svelte';
	import IconBase from '$lib/components/primitives/Icon.svelte';
	import Spinner from '$lib/components/primitives/Spinner.svelte';
	import Gavel from '$lib/components/icons/Gavel.svelte';
	import Increase from '$lib/components/icons/Increase.svelte';
	import Lightning from '$lib/components/icons/Lightning.svelte';
	import RouteIcon from '$lib/components/icons/Route.svelte';
	import WarehouseIcon from '$lib/components/icons/Warehouse.svelte';
	import { getBidWindowPrimaryAction } from '$lib/config/driverLifecycleIa';
	import { bidStatusLabels, bidStatusChipVariants } from '$lib/config/lifecycleLabels';
	import { formatAssignmentDate } from '$lib/utils/date/formatting';
	import { bidsStore } from '$lib/stores/bidsStore.svelte';

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
						<div class="assignment-list">
							{#each bidsStore.availableWindows as window (window.id)}
								{@const isEmergency = window.mode === 'emergency'}
								{@const isBoosted = window.payBonusPercent > 0}
								<div
									class="assignment-item"
									style="--icon-accent: var({isEmergency ? '--status-success' : '--status-info'});"
								>
									<div class="icon-circle" aria-hidden="true">
										{#if isEmergency}
											<Lightning />
										{:else}
											<Gavel />
										{/if}
									</div>
									<div class="assignment-content">
										<div class="assignment-header">
											<div class="header-left">
												<div class="date-row">
													<span class="assignment-date"
														>{formatAssignmentDate(window.assignmentDate)}</span
													>
													{#if isBoosted}
														<span class="premium-badge">
															<span class="premium-badge-value"
																>{window.payBonusPercent}%</span
															>
															<Increase fill="currentColor" />
														</span>
													{/if}
												</div>
												{#if isEmergency}
													<span class="header-muted">{m.bids_emergency_first_come()}</span>
												{:else}
													<span class="header-muted">{formatClosesAt(window.closesAt)}</span>
												{/if}
											</div>
											<div class="header-right">
												<IconButton
													tooltip={getBidActionLabel(window.mode)}
													onclick={() => handleSubmitBid(window.assignmentId)}
													disabled={bidsStore.submittingAssignmentId !== null}
												>
													<IconBase size="small">
														{#if bidsStore.isSubmitting(window.assignmentId)}
															<Spinner size={14} />
														{:else}
															<Gavel />
														{/if}
													</IconBase>
												</IconButton>
											</div>
										</div>
										<div class="assignment-meta">
											<Chip
												variant="tag"
												size="xs"
												color="var(--text-muted)"
												label={window.routeName}
												icon={routeChipIcon}
											/>
											<Chip
												variant="tag"
												size="xs"
												color="var(--text-muted)"
												label={window.warehouseName}
												icon={warehouseChipIcon}
											/>
										</div>
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
						<div class="assignment-list">
							{#each bidsStore.myBids as bid (bid.id)}
								{@const isResolved = bid.status !== 'pending'}
								{@const iconAccent =
									bid.status === 'won'
										? '--status-success'
										: bid.status === 'lost'
											? '--text-muted'
											: '--status-info'}
								<div
									class="assignment-item"
									class:resolved={isResolved}
									style="--icon-accent: var({iconAccent});"
								>
									<div class="icon-circle" aria-hidden="true">
										<Gavel />
									</div>
									<div class="assignment-content">
										<div class="assignment-header">
											<div class="header-left">
												<span class="assignment-date"
													>{formatAssignmentDate(bid.assignmentDate)}</span
												>
												<span class="header-muted">{formatSubmittedAt(bid.bidAt)}</span>
											</div>
											<div class="header-right">
												<Chip
													variant="status"
													status={bidStatusChipVariants[bid.status]}
													label={bidStatusLabels[bid.status]}
													size="xs"
												/>
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
	.bids-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-5);
	}

	.bids-section {
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

	/* Icon circle — tinted with accent color */
	.icon-circle {
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--icon-accent) 12%, transparent);
		color: var(--icon-accent);
		flex-shrink: 0;
	}

	.icon-circle :global(svg) {
		width: 20px;
		height: 20px;
	}

	/* Assignment items */
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

	.assignment-item.resolved {
		opacity: 0.55;
	}

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

	.date-row {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--spacing-1);
	}

	.premium-badge {
		position: relative;
		isolation: isolate;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: var(--spacing-1) var(--spacing-2);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--status-success) 15%, transparent);
		color: var(--status-success);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		vertical-align: middle;
		line-height: 1;
	}

	.premium-badge-value {
		display: inline-flex;
		align-items: center;
		line-height: 1;
		transform: translateY(0.5px);
	}

	.premium-badge :global(svg) {
		width: 12px;
		height: 12px;
		display: block;
		flex-shrink: 0;
	}

	.premium-badge::before,
	.premium-badge::after {
		--pulse-angle: 0deg;
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		box-sizing: border-box;
		background-image: conic-gradient(
			from var(--pulse-angle),
			transparent 20%,
			color-mix(in srgb, var(--status-success) 40%, transparent) 30%,
			var(--status-success) 35%,
			transparent 40%,
			transparent 70%,
			color-mix(in srgb, var(--status-success) 40%, transparent) 80%,
			var(--status-success) 85%,
			transparent 90%
		);
		animation: premium-attention-spin 6s linear infinite;
		z-index: -1;
		pointer-events: none;
		padding: 1px;
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		-webkit-mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
		-webkit-mask-composite: xor;
	}

	.premium-badge::before {
		filter: blur(0.5rem);
		opacity: 0.5;
	}

	.premium-badge::after {
		opacity: 1;
	}

	@keyframes premium-attention-spin {
		from {
			--pulse-angle: 0deg;
		}
		to {
			--pulse-angle: 360deg;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.premium-badge::before,
		.premium-badge::after {
			animation: none;
		}
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

	/* Empty States */
	.empty-state {
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
	}

	@media (pointer: coarse) {
		.assignment-item {
			min-height: 44px;
		}
	}
</style>
