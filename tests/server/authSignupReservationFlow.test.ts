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
				organizationId: 'org-1',
				targetRole: 'driver'
			})
			.mockResolvedValueOnce({ allowed: false, reason: 'approval_not_found' });

		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveOrganizationJoinSignup: reserveAuthorization
		});

		await expect(
			guard({
				path: '/sign-up/email',
				body: { email: 'race@driver.test' },
				headers: new Headers({
					'x-signup-org-mode': 'join',
					'x-signup-org-code': 'ORG-RACE-123'
				}),
				context: {}
			} as never)
		).resolves.toBeUndefined();

		const blockedAttempt = guard({
			path: '/sign-up/email',
			body: { email: 'race@driver.test' },
			headers: new Headers({
				'x-signup-org-mode': 'join',
				'x-signup-org-code': 'ORG-RACE-123'
			}),
			context: {}
		} as never);

		await expect(blockedAttempt).rejects.toBeInstanceOf(APIError);
		await expect(blockedAttempt).rejects.toMatchObject({
			message: 'Signup is restricted. Please contact a manager for approval.'
		});
	});

	it('denies signup when organization code is invalid', async () => {
		const reserveAuthorization = vi.fn(async () => ({
			allowed: false as const,
			reason: 'invalid_org_code' as const
		}));

		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveOrganizationJoinSignup: reserveAuthorization
		});

		const blockedAttempt = guard({
			path: '/sign-up/email',
			body: { email: 'invalid-org@driver.test' },
			headers: new Headers({
				'x-signup-org-mode': 'join',
				'x-signup-org-code': 'BAD-CODE'
			}),
			context: {}
		} as never);

		await expect(blockedAttempt).rejects.toBeInstanceOf(APIError);
		await expect(blockedAttempt).rejects.toMatchObject({
			message: 'Invalid organization code'
		});
	});

	it('records reconciliation when finalize does not consume an acquired reservation', async () => {
		const finalizeReservation = vi.fn(async () => null);
		const releaseReservation = vi.fn(async () => null);
		const recordReconciliation = vi.fn(async () => undefined);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeOrganizationJoinSignup: finalizeReservation,
			releaseProductionSignupAuthorizationReservation: releaseReservation,
			recordSignupFinalizeReconciliation: recordReconciliation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOnboardingReservationId: '88888888-8888-4888-8888-888888888888',
					signupOrganization: {
						mode: 'join',
						organizationCode: 'ORG-RACE-123'
					},
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
