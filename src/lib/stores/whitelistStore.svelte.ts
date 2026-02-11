/**
 * Whitelist Store
 *
 * Manages signup onboarding entries with optimistic UI updates.
 * All API calls are owned by this store.
 */

import type { SignupOnboardingKind, SignupOnboardingStatus } from '$lib/schemas/onboarding';
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';
import * as m from '$lib/paraglide/messages.js';
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';
import { z } from 'zod';

export type WhitelistResolvedStatus = SignupOnboardingStatus | 'expired';

export interface WhitelistEntry {
	id: string;
	email: string;
	kind: SignupOnboardingKind;
	status: SignupOnboardingStatus;
	resolvedStatus: WhitelistResolvedStatus;
	createdBy: string | null;
	createdByName: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	consumedAt: Date | null;
	consumedByUserId: string | null;
	revokedAt: Date | null;
	revokedByUserId: string | null;
	updatedAt: Date;
}

const whitelistEntrySchema = z.object({
	id: z.string().min(1),
	email: z.string().min(1),
	kind: z.enum(['approval', 'invite']),
	status: z.enum(['pending', 'reserved', 'consumed', 'revoked']),
	resolvedStatus: z.enum(['pending', 'reserved', 'consumed', 'revoked', 'expired']),
	createdBy: z.string().nullable(),
	createdByName: z.string().nullable(),
	createdAt: z.coerce.date(),
	expiresAt: z.coerce.date().nullable(),
	consumedAt: z.coerce.date().nullable(),
	consumedByUserId: z.string().nullable(),
	revokedAt: z.coerce.date().nullable(),
	revokedByUserId: z.string().nullable(),
	updatedAt: z.coerce.date()
});

const listResponseSchema = z.object({
	entries: z.array(whitelistEntrySchema)
});

const mutationResponseSchema = z.object({
	entry: whitelistEntrySchema
});

const state = $state<{
	entries: WhitelistEntry[];
	isLoading: boolean;
	error: string | null;
}>({
	entries: [],
	isLoading: false,
	error: null
});

const mutationVersions = new Map<string, number>();

function nextMutationVersion(mutationKey: string): number {
	const version = (mutationVersions.get(mutationKey) ?? 0) + 1;
	mutationVersions.set(mutationKey, version);
	return version;
}

function isLatestMutationVersion(mutationKey: string, version: number): boolean {
	return (mutationVersions.get(mutationKey) ?? 0) === version;
}

export const whitelistStore = {
	get entries() {
		return state.entries;
	},
	get isLoading() {
		return state.isLoading;
	},
	get error() {
		return state.error;
	},

	async load() {
		state.isLoading = true;
		state.error = null;

		try {
			const res = await fetch('/api/onboarding');
			if (!res.ok) {
				throw new Error('Failed to load whitelist entries');
			}
			const parsed = listResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid whitelist response');
			}
			state.entries = parsed.data.entries;
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
			toastStore.error(m.whitelist_load_error());
		} finally {
			state.isLoading = false;
		}
	},

	create(email: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const tempId = `optimistic-${crypto.randomUUID()}`;
		const now = new Date();
		const mutationKey = `create:${tempId}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		const optimisticEntry: WhitelistEntry = {
			id: tempId,
			email: email.trim().toLowerCase(),
			kind: 'approval',
			status: 'pending',
			resolvedStatus: 'pending',
			createdBy: null,
			createdByName: null,
			createdAt: now,
			expiresAt: null,
			consumedAt: null,
			consumedByUserId: null,
			revokedAt: null,
			revokedByUserId: null,
			updatedAt: now
		};

		state.entries = [optimisticEntry, ...state.entries];

		this._createInApi(email, tempId, mutationKey, mutationVersion);
	},

	async _createInApi(email: string, tempId: string, mutationKey: string, mutationVersion: number) {
		try {
			const res = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind: 'approval', email })
			});

			if (res.status === 409) {
				if (!isLatestMutationVersion(mutationKey, mutationVersion)) return;
				state.entries = state.entries.filter((e) => e.id !== tempId);
				toastStore.error(m.whitelist_entry_exists());
				return;
			}

			if (!res.ok) {
				throw new Error('Failed to create whitelist entry');
			}

			const parsed = mutationResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid create response');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) return;

			state.entries = state.entries.map((e) =>
				e.id === tempId
					? {
							...parsed.data.entry,
							createdByName: e.createdByName ?? parsed.data.entry.createdByName
						}
					: e
			);
			toastStore.success(m.whitelist_created_success());
		} catch {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) return;
			state.entries = state.entries.filter((e) => e.id !== tempId);
			toastStore.error(m.whitelist_create_error());
		}
	},

	revoke(id: string) {
		if (!ensureOnlineForWrite()) {
			return;
		}

		const original = state.entries.find((e) => e.id === id);
		if (!original) return;
		const mutationKey = `revoke:${id}`;
		const mutationVersion = nextMutationVersion(mutationKey);

		state.entries = state.entries.map((e) =>
			e.id === id
				? {
						...e,
						status: 'revoked' as const,
						resolvedStatus: 'revoked' as const,
						revokedAt: new Date(),
						updatedAt: new Date()
					}
				: e
		);

		this._revokeInApi(id, original, mutationKey, mutationVersion);
	},

	async _revokeInApi(
		id: string,
		original: WhitelistEntry,
		mutationKey: string,
		mutationVersion: number
	) {
		try {
			const res = await fetch(`/api/onboarding/${id}/revoke`, {
				method: 'PATCH'
			});

			if (!res.ok) {
				throw new Error('Failed to revoke entry');
			}

			const parsed = mutationResponseSchema.safeParse(await res.json());
			if (!parsed.success) {
				throw new Error('Invalid revoke response');
			}

			if (!isLatestMutationVersion(mutationKey, mutationVersion)) return;

			state.entries = state.entries.map((e) =>
				e.id === id
					? {
							...parsed.data.entry,
							createdByName: e.createdByName ?? parsed.data.entry.createdByName
						}
					: e
			);
			toastStore.success(m.whitelist_revoked_success());
		} catch {
			if (!isLatestMutationVersion(mutationKey, mutationVersion)) return;
			state.entries = state.entries.map((e) => (e.id === id ? original : e));
			toastStore.error(m.whitelist_revoke_error());
		}
	}
};
