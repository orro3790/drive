/**
 * Bids Store
 *
 * Manages driver bid state: available windows, submitted bids, and bid submission.
 */

import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';

export type BidStatus = 'pending' | 'won' | 'lost';
export type BidWindowMode = 'competitive' | 'instant' | 'emergency';

export type AvailableBidWindow = {
	id: string;
	assignmentId: string;
	assignmentDate: string;
	routeName: string;
	warehouseName: string;
	mode: BidWindowMode;
	payBonusPercent: number;
	opensAt: string;
	closesAt: string;
};

export type DriverBid = {
	id: string;
	assignmentId: string;
	assignmentDate: string;
	routeName: string;
	warehouseName: string;
	status: BidStatus;
	score: number | null;
	bidAt: string;
	windowClosesAt: string;
	resolvedAt: string | null;
};

const state = $state<{
	availableWindows: AvailableBidWindow[];
	myBids: DriverBid[];
	isLoadingAvailable: boolean;
	isLoadingMyBids: boolean;
	submittingAssignmentId: string | null;
	error: string | null;
}>({
	availableWindows: [],
	myBids: [],
	isLoadingAvailable: false,
	isLoadingMyBids: false,
	submittingAssignmentId: null,
	error: null
});

export const bidsStore = {
	get availableWindows() {
		return state.availableWindows;
	},
	get myBids() {
		return state.myBids;
	},
	get isLoadingAvailable() {
		return state.isLoadingAvailable;
	},
	get isLoadingMyBids() {
		return state.isLoadingMyBids;
	},
	get submittingAssignmentId() {
		return state.submittingAssignmentId;
	},
	isSubmitting(assignmentId: string) {
		return state.submittingAssignmentId === assignmentId;
	},
	get error() {
		return state.error;
	},

	async loadAvailable() {
		state.isLoadingAvailable = true;
		state.error = null;

		try {
			const res = await fetch('/api/bids/available');
			if (!res.ok) {
				throw new Error('Failed to load available bids');
			}

			const data = await res.json();
			state.availableWindows = data.bidWindows ?? [];
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.bids_load_available_error());
		} finally {
			state.isLoadingAvailable = false;
		}
	},

	async loadMyBids() {
		state.isLoadingMyBids = true;
		state.error = null;

		try {
			const res = await fetch('/api/bids/mine');
			if (!res.ok) {
				throw new Error('Failed to load my bids');
			}

			const data = await res.json();
			state.myBids = data.bids ?? [];
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.bids_load_mine_error());
		} finally {
			state.isLoadingMyBids = false;
		}
	},

	async loadAll() {
		await Promise.all([this.loadAvailable(), this.loadMyBids()]);
	},

	async submitBid(assignmentId: string) {
		if (!ensureOnlineForWrite()) {
			return false;
		}

		state.submittingAssignmentId = assignmentId;

		try {
			const res = await fetch('/api/bids', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ assignmentId })
			});

			if (!res.ok) {
				const errorData = await res.json().catch(() => ({}));
				throw new Error(errorData.message || 'Failed to submit bid');
			}

			const data = await res.json();

			// Handle instant/emergency assignment (won immediately)
			if (data.status === 'won') {
				const bonusText =
					data.bonusPercent > 0 ? m.bids_accept_success_bonus({ bonus: data.bonusPercent }) : '';
				toastStore.success(m.bids_accept_success() + bonusText);

				// Remove from available and refresh
				state.availableWindows = state.availableWindows.filter(
					(w) => w.assignmentId !== assignmentId
				);
				await this.loadMyBids();
				return true;
			}

			// Competitive mode: refresh both lists
			await this.loadAll();
			toastStore.success(m.bids_submit_success());
			return true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(message);
			return false;
		} finally {
			state.submittingAssignmentId = null;
		}
	}
};
