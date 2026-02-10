import { describe, expect, it, vi } from 'vitest';
import { APIError } from 'better-auth/api';

import {
	createSignupAbuseGuard,
	createSignupOnboardingConsumer,
	type SignupAbusePolicyConfig
} from '$lib/server/auth-abuse-hardening';

function createProductionAllowlistConfig(): SignupAbusePolicyConfig {
	return {
		isProduction: true,
		signupPolicyMode: 'allowlist',
		allowlistedEmails: new Set(),
		localInviteCode: null
	};
}

describe('auth signup reservation flow', () => {
	it('blocks competing signup when reservation cannot be acquired', async () => {
		const reserveAuthorization = vi
			.fn()
			.mockResolvedValueOnce({
				allowed: true,
				reservationId: '77777777-7777-4777-8777-777777777777',
				matchedEntryId: '77777777-7777-4777-8777-777777777777',
				matchedKind: 'approval'
			})
			.mockResolvedValueOnce({ allowed: false });

		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveProductionSignupAuthorization: reserveAuthorization
		});

		await expect(
			guard({
				path: '/sign-up/email',
				body: { email: 'race@driver.test' },
				headers: new Headers(),
				context: {}
			} as never)
		).resolves.toBeUndefined();

		const blockedAttempt = guard({
			path: '/sign-up/email',
			body: { email: 'race@driver.test' },
			headers: new Headers(),
			context: {}
		} as never);

		await expect(blockedAttempt).rejects.toBeInstanceOf(APIError);
		await expect(blockedAttempt).rejects.toMatchObject({
			message: 'Signup is restricted. Please contact a manager for approval.'
		});
	});

	it('records reconciliation when finalize does not consume an acquired reservation', async () => {
		const finalizeReservation = vi.fn(async () => null);
		const releaseReservation = vi.fn(async () => null);
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
					signupOnboardingReservationId: '88888888-8888-4888-8888-888888888888',
					returned: {
						user: {
							id: 'driver-8',
							email: 'driver8@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(recordReconciliation).toHaveBeenCalledWith({
			reservationId: '88888888-8888-4888-8888-888888888888',
			userId: 'driver-8',
			email: 'driver8@example.test'
		});
		expect(releaseReservation).not.toHaveBeenCalled();
	});
});
