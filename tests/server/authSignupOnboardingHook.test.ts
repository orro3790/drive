import { describe, expect, it, vi } from 'vitest';

import {
	createSignupAbuseGuard,
	createSignupOnboardingConsumer,
	type SignupAbusePolicyConfig
} from '$lib/server/auth-abuse-hardening';
import type { SignupOnboardingEntryRecord } from '$lib/server/services/onboarding';

function createProductionAllowlistConfig(): SignupAbusePolicyConfig {
	return {
		isProduction: true,
		signupPolicyMode: 'allowlist',
		allowlistedEmails: new Set(),
		localInviteCode: null
	};
}

function createReservationEntry(
	id: string,
	status: SignupOnboardingEntryRecord['status'] = 'reserved'
): SignupOnboardingEntryRecord {
	const now = new Date('2026-02-10T00:00:00.000Z');

	return {
		id,
		email: 'driver@example.test',
		kind: 'approval',
		tokenHash: null,
		status,
		createdBy: 'manager-1',
		createdAt: now,
		expiresAt: null,
		consumedAt: status === 'consumed' ? now : null,
		consumedByUserId: status === 'consumed' ? 'driver-1' : null,
		revokedAt: null,
		revokedByUserId: null,
		updatedAt: now
	};
}

describe('signup onboarding auth hooks', () => {
	it('stores reservation id on context in production signup guard', async () => {
		const reservationId = '11111111-1111-4111-8111-111111111111';
		const reserveAuthorization = vi.fn(async () => ({
			allowed: true as const,
			reservationId,
			matchedEntryId: 'entry-1',
			matchedKind: 'approval' as const
		}));

		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveProductionSignupAuthorization: reserveAuthorization
		});

		const context: Record<string, unknown> = {};
		await expect(
			guard({
				path: '/sign-up/email',
				body: { email: 'approved@driver.test' },
				headers: new Headers(),
				context
			} as never)
		).resolves.toBeUndefined();

		expect(reserveAuthorization).toHaveBeenCalledWith({
			email: 'approved@driver.test',
			inviteCodeHeader: null
		});
		expect(context.signupOnboardingReservationId).toBe(reservationId);
	});

	it('finalizes reservation after successful production signup', async () => {
		const reservationId = '22222222-2222-4222-8222-222222222222';
		const finalizeReservation = vi.fn(async () =>
			createReservationEntry(reservationId, 'consumed')
		);
		const releaseReservation = vi.fn(async () => null);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeProductionSignupAuthorizationReservation: finalizeReservation,
			releaseProductionSignupAuthorizationReservation: releaseReservation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOnboardingReservationId: reservationId,
					returned: {
						user: {
							id: 'driver-2',
							email: 'driver2@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(finalizeReservation).toHaveBeenCalledWith({
			reservationId,
			userId: 'driver-2'
		});
		expect(releaseReservation).not.toHaveBeenCalled();
	});

	it('releases reservation when signup does not return a successful payload', async () => {
		const reservationId = '33333333-3333-4333-8333-333333333333';
		const finalizeReservation = vi.fn(async () =>
			createReservationEntry(reservationId, 'consumed')
		);
		const releaseReservation = vi.fn(async () => createReservationEntry(reservationId, 'pending'));

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeProductionSignupAuthorizationReservation: finalizeReservation,
			releaseProductionSignupAuthorizationReservation: releaseReservation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOnboardingReservationId: reservationId,
					returned: new Response('{"error":"failed"}', { status: 400 })
				}
			} as never)
		).resolves.toBeUndefined();

		expect(releaseReservation).toHaveBeenCalledWith({
			reservationId
		});
		expect(finalizeReservation).not.toHaveBeenCalled();
	});

	it('records reconciliation when finalize fails after signup success', async () => {
		const reservationId = '44444444-4444-4444-8444-444444444444';
		const finalizeError = new Error('finalize failed');
		const finalizeReservation = vi.fn(async () => {
			throw finalizeError;
		});
		const releaseReservation = vi.fn(async () => createReservationEntry(reservationId, 'pending'));
		const recordReconciliation = vi.fn(async () => undefined);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeProductionSignupAuthorizationReservation: finalizeReservation,
			releaseProductionSignupAuthorizationReservation: releaseReservation,
			recordSignupFinalizeReconciliation: recordReconciliation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOnboardingReservationId: reservationId,
					returned: {
						user: {
							id: 'driver-4',
							email: 'driver4@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(recordReconciliation).toHaveBeenCalledWith({
			reservationId,
			userId: 'driver-4',
			email: 'driver4@example.test',
			error: finalizeError
		});
		expect(releaseReservation).not.toHaveBeenCalled();
	});
});
