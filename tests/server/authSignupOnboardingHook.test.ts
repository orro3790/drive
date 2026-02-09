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
	it('uses production onboarding resolver in signup guard', async () => {
		const resolveAuthorization = vi.fn(async () => ({ allowed: true as const }));
		const guard = createSignupAbuseGuard(createProductionAllowlistConfig(), {
			resolveProductionSignupAuthorization: resolveAuthorization
		});

		await expect(
			guard({
				path: '/sign-up/email',
				body: { email: 'approved@driver.test' },
				headers: new Headers()
			} as never)
		).resolves.toBeUndefined();

		expect(resolveAuthorization).toHaveBeenCalledWith({
			email: 'approved@driver.test',
			inviteCodeHeader: null
		});
	});

	it('consumes onboarding entry after successful production signup', async () => {
		const consumeAuthorization = vi.fn(async () => null);
		const consumer = createSignupOnboardingConsumer(createProductionAllowlistConfig(), {
			consumeProductionSignupAuthorization: consumeAuthorization
		});

		await expect(
			consumer({
				path: '/sign-up/email',
				headers: new Headers({ 'x-invite-code': 'invite-token' }),
				context: {
					returned: {
						user: {
							id: 'driver-1',
							email: 'driver@example.test'
						}
					}
				}
			} as never)
		).resolves.toBeUndefined();

		expect(consumeAuthorization).toHaveBeenCalledWith({
			email: 'driver@example.test',
			userId: 'driver-1',
			inviteCodeHeader: 'invite-token'
		});
	});
});
