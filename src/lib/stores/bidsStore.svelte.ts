/**
 * Bids Store
 *
 * Manages driver bid state: available windows, submitted bids, and bid submission.
 */

import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import * as m from '$lib/paraglide/messages.js';
import { z } from 'zod';

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

const availableBidWindowSchema = z.object({
	id: z.string().min(1),
	assignmentId: z.string().min(1),
	assignmentDate: z.string().min(1),
	routeName: z.string().min(1),
	warehouseName: z.string().min(1),
	mode: z.enum(['competitive', 'instant', 'emergency']),
	payBonusPercent: z.number(),
	opensAt: z.string().min(1),
	closesAt: z.string().min(1)
});

const driverBidSchema = z.object({
	id: z.string().min(1),
	assignmentId: z.string().min(1),
	assignmentDate: z.string().min(1),
	routeName: z.string().min(1),
	warehouseName: z.string().min(1),
	status: z.enum(['pending', 'won', 'lost']),
	score: z.number().nullable(),
	bidAt: z.string().min(1),
	windowClosesAt: z.string().min(1),
	resolvedAt: z.string().min(1).nullable()
});

const availableBidsResponseSchema = z.object({
	bidWindows: z.array(availableBidWindowSchema)
});

const myBidsResponseSchema = z.object({
	bids: z.array(driverBidSchema)
});

const submitBidResponseSchema = z.union([
	z.object({
		success: z.literal(true),
		status: z.literal('won'),
		assignmentId: z.string().min(1),
		bonusPercent: z.number().nonnegative().optional()
	}),
	z.object({
		success: z.literal(true),
		status: z.literal('pending'),
		bid: z
			.object({
				id: z.string().min(1),
				assignmentId: z.string().min(1),
				status: z.literal('pending'),
				bidAt: z.string().min(1),
				windowClosesAt: z.string().min(1)
			})
			.optional()
	})
]);

const loadRequestVersions = {
	available: 0,
	myBids: 0
};

function nextLoadRequestVersion(kind: keyof typeof loadRequestVersions): number {
	loadRequestVersions[kind] += 1;
	return loadRequestVersions[kind];
}

function isLatestLoadRequestVersion(
	kind: keyof typeof loadRequestVersions,
	version: number
): boolean {
	return loadRequestVersions[kind] === version;
}

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
		const requestVersion = nextLoadRequestVersion('available');
		state.isLoadingAvailable = true;
		state.error = null;

		try {
			const res = await fetch('/api/bids/available');
			if (!res.ok) {
				throw new Error('Failed to load available bids');
			}

			const parsed = availableBidsResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid available bids response');
			}

			if (!isLatestLoadRequestVersion('available', requestVersion)) {
				return;
			}

			state.availableWindows = parsed.data.bidWindows;
		} catch (err) {
			if (!isLatestLoadRequestVersion('available', requestVersion)) {
				return;
			}

			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.bids_load_available_error());
		} finally {
			if (isLatestLoadRequestVersion('available', requestVersion)) {
				state.isLoadingAvailable = false;
			}
		}
	},

	async loadMyBids() {
		const requestVersion = nextLoadRequestVersion('myBids');
		state.isLoadingMyBids = true;
		state.error = null;

		try {
			const res = await fetch('/api/bids/mine');
			if (!res.ok) {
				throw new Error('Failed to load my bids');
			}

			const parsed = myBidsResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid bids response');
			}

			if (!isLatestLoadRequestVersion('myBids', requestVersion)) {
				return;
			}

			state.myBids = parsed.data.bids;
		} catch (err) {
			if (!isLatestLoadRequestVersion('myBids', requestVersion)) {
				return;
			}

			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.bids_load_mine_error());
		} finally {
			if (isLatestLoadRequestVersion('myBids', requestVersion)) {
				state.isLoadingMyBids = false;
			}
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

			const parsed = submitBidResponseSchema.safeParse(await res.json().catch(() => ({})));
			if (!parsed.success) {
				throw new Error('Invalid bid submission response');
			}

			const data = parsed.data;

			// Handle instant/emergency assignment (won immediately)
			if (data.status === 'won') {
				const bonusText =
					(data.bonusPercent ?? 0) > 0
						? m.bids_accept_success_bonus({ bonus: data.bonusPercent ?? 0 })
						: '';
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
