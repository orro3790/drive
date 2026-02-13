import { describe, expect, it, vi } from 'vitest';

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

describe('signup onboarding auth hooks', () => {
	it('stores join reservation id and organization metadata on context', async () => {
		const reservationId = '11111111-1111-4111-8111-111111111111';
		const reserveJoinAuthorization = vi.fn(async () => ({
			allowed: true as const,
			reservationId,
			organizationId: 'org-1',
			targetRole: 'driver' as const
		}));

		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveOrganizationJoinSignup: reserveJoinAuthorization
		});

		const context: Record<string, unknown> = {};
		await expect(
			guard({
				path: '/sign-up/email',
				body: { email: 'approved@driver.test' },
				headers: new Headers({
					'x-signup-org-mode': 'join',
					'x-signup-org-code': 'ORG-CODE-123'
				}),
				context
			} as never)
		).resolves.toBeUndefined();

		expect(reserveJoinAuthorization).toHaveBeenCalledWith({
			email: 'approved@driver.test',
			organizationCode: 'ORG-CODE-123'
		});
		expect(context.signupOnboardingReservationId).toBe(reservationId);
		expect(context.signupOrganization).toEqual({
			mode: 'join',
			organizationCode: 'ORG-CODE-123'
		});
		expect(context.signupOrganizationAssignment).toEqual({
			organizationId: 'org-1',
			role: 'driver',
			source: 'join_reservation',
			reservationId
		});
	});

	it('accepts create mode without reserving onboarding approval', async () => {
		const reserveJoinAuthorization = vi.fn();

		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveOrganizationJoinSignup: reserveJoinAuthorization
		});

		const context: Record<string, unknown> = {};
		await expect(
			guard({
				path: '/sign-up/email',
				body: { email: 'owner@example.test' },
				headers: new Headers({
					'x-signup-org-mode': 'create',
					'x-signup-org-name': 'Acme Logistics'
				}),
				context
			} as never)
		).resolves.toBeUndefined();

		expect(reserveJoinAuthorization).not.toHaveBeenCalled();
		expect(context.signupOrganization).toEqual({
			mode: 'create',
			organizationName: 'Acme Logistics'
		});
	});

	it('finalizes join reservation after successful signup', async () => {
		const reservationId = '22222222-2222-4222-8222-222222222222';
		const finalizeJoinReservation = vi.fn(async () => ({
			reservationId,
			organizationId: 'org-2',
			targetRole: 'driver' as const
		}));
		const finalizeCreateOrganization = vi.fn(async () => null);
		const releaseReservation = vi.fn(async () => null);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeOrganizationJoinSignup: finalizeJoinReservation,
			finalizeOrganizationCreateSignup: finalizeCreateOrganization,
			releaseProductionSignupAuthorizationReservation: releaseReservation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOnboardingReservationId: reservationId,
					signupOrganization: {
						mode: 'join',
						organizationCode: 'ORG-JOIN-456'
					},
					returned: {
						user: {
							id: 'driver-2',
							email: 'driver2@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(finalizeJoinReservation).toHaveBeenCalledWith({
			reservationId,
			userId: 'driver-2'
		});
		expect(finalizeCreateOrganization).not.toHaveBeenCalled();
		expect(releaseReservation).not.toHaveBeenCalled();
	});

	it('releases join reservation when signup does not return a successful payload', async () => {
		const reservationId = '33333333-3333-4333-8333-333333333333';
		const finalizeJoinReservation = vi.fn(async () => null);
		const finalizeCreateOrganization = vi.fn(async () => null);
		const releaseReservation = vi.fn(async () => null);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeOrganizationJoinSignup: finalizeJoinReservation,
			finalizeOrganizationCreateSignup: finalizeCreateOrganization,
			releaseProductionSignupAuthorizationReservation: releaseReservation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOnboardingReservationId: reservationId,
					signupOrganization: {
						mode: 'join',
						organizationCode: 'ORG-JOIN-789'
					},
					returned: new Response('{"error":"failed"}', { status: 400 })
				}
			} as never)
		).resolves.toBeUndefined();

		expect(releaseReservation).toHaveBeenCalledWith({
			reservationId
		});
		expect(finalizeJoinReservation).not.toHaveBeenCalled();
		expect(finalizeCreateOrganization).not.toHaveBeenCalled();
	});

	it('finalizes organization creation after successful signup', async () => {
		const createOrganizationId = '44444444-4444-4444-8444-444444444444';
		const finalizeJoinReservation = vi.fn(async () => null);
		const finalizeCreateOrganization = vi.fn(async () => ({
			organizationId: createOrganizationId,
			ownerUserId: 'owner-1'
		}));
		const releaseReservation = vi.fn(async () => null);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeOrganizationJoinSignup: finalizeJoinReservation,
			finalizeOrganizationCreateSignup: finalizeCreateOrganization,
			releaseProductionSignupAuthorizationReservation: releaseReservation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOrganizationAssignment: {
						organizationId: createOrganizationId,
						role: 'manager',
						source: 'create_provision'
					},
					signupOrganization: {
						mode: 'create',
						organizationName: 'Acme Logistics'
					},
					returned: {
						user: {
							id: 'owner-1',
							email: 'owner@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(finalizeCreateOrganization).toHaveBeenCalledWith({
			userId: 'owner-1',
			organizationId: createOrganizationId
		});
		expect(finalizeJoinReservation).not.toHaveBeenCalled();
		expect(releaseReservation).not.toHaveBeenCalled();
	});

	it('records reconciliation when create finalization fails after signup success', async () => {
		const createOrganizationId = '55555555-5555-4555-8555-555555555555';
		const finalizeCreateError = new Error('create finalize failed');
		const finalizeJoinReservation = vi.fn(async () => null);
		const finalizeCreateOrganization = vi.fn(async () => {
			throw finalizeCreateError;
		});
		const releaseReservation = vi.fn(async () => null);
		const recordCreateReconciliation = vi.fn(async () => undefined);

		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeOrganizationJoinSignup: finalizeJoinReservation,
			finalizeOrganizationCreateSignup: finalizeCreateOrganization,
			releaseProductionSignupAuthorizationReservation: releaseReservation,
			recordSignupCreateOrganizationFinalizeReconciliation: recordCreateReconciliation
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers(),
				context: {
					signupOrganizationAssignment: {
						organizationId: createOrganizationId,
						role: 'manager',
						source: 'create_provision'
					},
					signupOrganization: {
						mode: 'create',
						organizationName: 'Acme Logistics'
					},
					returned: {
						user: {
							id: 'owner-2',
							email: 'owner2@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(recordCreateReconciliation).toHaveBeenCalledWith({
			userId: 'owner-2',
			email: 'owner2@example.test',
			organizationName: 'Acme Logistics',
			error: finalizeCreateError
		});
		expect(finalizeJoinReservation).not.toHaveBeenCalled();
		expect(releaseReservation).not.toHaveBeenCalled();
	});
});
