import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';

import {
	createSignupAbuseGuard,
	createSignupOnboardingConsumer,
	createSignupOrganizationAssignmentDbHook,
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

describe('auth database hook org assignment', () => {
	it('maps join reservation metadata into pre-insert user data', async () => {
		const reservationId = '11111111-1111-4111-8111-111111111111';
		const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveOrganizationJoinSignup: vi.fn(async () => ({
				allowed: true as const,
				reservationId,
				organizationId,
				targetRole: 'driver' as const
			}))
		});
		const dbHook = createSignupOrganizationAssignmentDbHook();

		const sharedContext: Record<string, unknown> = {};
		await guard({
			path: '/sign-up/email',
			body: { email: 'joiner@example.test' },
			headers: new Headers({
				'x-signup-org-mode': 'join',
				'x-signup-org-code': 'ORG-JOIN-123'
			}),
			context: sharedContext
		} as never);

		const result = await dbHook(
			{ email: 'joiner@example.test' },
			{ path: '/sign-up/email', context: sharedContext }
		);

		expect(result).toEqual({
			data: {
				organizationId,
				role: 'driver'
			}
		});
	});

	it('provisions create-mode organization once and stores assignment context', async () => {
		const prepareOrganizationCreateSignup = vi.fn(async () => ({
			organizationId: 'org-create',
			organizationSlug: 'acme-logistics',
			organizationJoinCode: 'A1B2C3D4E5F6'
		}));
		const guard = createSignupAbuseGuard(createProductionAllowlistConfig());
		const dbHook = createSignupOrganizationAssignmentDbHook({ prepareOrganizationCreateSignup });

		const sharedContext: Record<string, unknown> = {};
		await guard({
			path: '/sign-up/email',
			body: { email: 'owner@example.test' },
			headers: new Headers({
				'x-signup-org-mode': 'create',
				'x-signup-org-name': 'Acme Logistics'
			}),
			context: sharedContext
		} as never);

		const result = await dbHook(
			{ email: 'owner@example.test' },
			{ path: '/sign-up/email', context: sharedContext }
		);

		expect(prepareOrganizationCreateSignup).toHaveBeenCalledWith({
			organizationName: 'Acme Logistics'
		});
		expect(result).toEqual({
			data: {
				organizationId: 'org-create',
				role: 'manager'
			}
		});
		expect(sharedContext.signupOrganizationAssignment).toEqual({
			organizationId: 'org-create',
			role: 'manager',
			source: 'create_provision'
		});
	});

	it('fails closed on non-signup user creation without explicit organization assignment', async () => {
		const dbHook = createSignupOrganizationAssignmentDbHook();

		await expect(
			dbHook({ email: 'new-user@example.test' }, { path: '/admin/create-user', context: {} })
		).rejects.toBeInstanceOf(APIError);
	});

	it('accepts explicit organization assignment on admin create-user path', async () => {
		const dbHook = createSignupOrganizationAssignmentDbHook();

		const result = await dbHook(
			{
				email: 'new-user@example.test',
				organizationId: '22222222-2222-4222-8222-222222222222',
				role: 'user'
			},
			{ path: '/admin/create-user', context: {} }
		);

		expect(result).toEqual({
			data: {
				organizationId: '22222222-2222-4222-8222-222222222222',
				role: 'driver'
			}
		});
	});

	it('preserves join assignment context across before -> db hook -> after', async () => {
		const reservationId = '33333333-3333-4333-8333-333333333333';
		const organizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			reserveOrganizationJoinSignup: vi.fn(async () => ({
				allowed: true as const,
				reservationId,
				organizationId,
				targetRole: 'driver' as const
			}))
		});
		const dbHook = createSignupOrganizationAssignmentDbHook();
		const finalizeOrganizationJoinSignup = vi.fn(async () => ({
			reservationId,
			organizationId,
			targetRole: 'driver' as const
		}));
		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			finalizeOrganizationJoinSignup
		});

		const sharedContext: Record<string, unknown> = {};
		await guard({
			path: '/sign-up/email',
			body: { email: 'driver@example.test' },
			headers: new Headers({
				'x-signup-org-mode': 'join',
				'x-signup-org-code': 'ORG-PROP-123'
			}),
			context: sharedContext
		} as never);

		await dbHook(
			{ email: 'driver@example.test' },
			{ path: '/sign-up/email', context: sharedContext }
		);

		sharedContext.returned = {
			user: {
				id: 'driver-1',
				email: 'driver@example.test'
			}
		};

		await consumer({
			path: '/sign-up/email',
			headers: new Headers(),
			context: sharedContext
		} as never);

		expect(finalizeOrganizationJoinSignup).toHaveBeenCalledWith({
			reservationId,
			userId: 'driver-1'
		});
	});
});
