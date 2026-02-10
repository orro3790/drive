import { describe, expect, it } from 'vitest';

import {
	AUTH_RATE_LIMIT_RULES,
	type SignupAbusePolicyConfig,
	buildAuthRateLimitConfig,
	evaluateSignupAttempt,
	parseAllowlistedSignupEmails,
	resolveSignupAbusePolicyConfig
} from '../../src/lib/server/auth-abuse-hardening';

function createPolicyConfig(
	overrides: Partial<SignupAbusePolicyConfig> = {}
): SignupAbusePolicyConfig {
	return {
		isProduction: false,
		signupPolicyMode: 'allowlist',
		allowlistedEmails: new Set(['approved@driver.test']),
		localInviteCode: null,
		...overrides
	};
}

describe('auth abuse hardening config', () => {
	it('normalizes allowlisted signup emails', () => {
		const parsed = parseAllowlistedSignupEmails(
			' Driver@One.test, driver@two.test;driver@three.test\nDriver@One.test '
		);

		expect([...parsed]).toEqual(['driver@one.test', 'driver@two.test', 'driver@three.test']);
	});

	it('defaults production signup mode to allowlist', () => {
		const config = resolveSignupAbusePolicyConfig({
			NODE_ENV: 'production',
			BETTER_AUTH_SIGNUP_ALLOWLIST: 'approved@driver.test'
		});

		expect(config.signupPolicyMode).toBe('allowlist');
		expect(config.allowlistedEmails.has('approved@driver.test')).toBe(true);
	});

	it('defaults development signup mode to open', () => {
		const config = resolveSignupAbusePolicyConfig({ NODE_ENV: 'development' });

		expect(config.signupPolicyMode).toBe('open');
	});

	it('falls back to safe mode when an unknown policy value is provided', () => {
		const config = resolveSignupAbusePolicyConfig({
			NODE_ENV: 'production',
			BETTER_AUTH_SIGNUP_POLICY: 'invalid-policy'
		});

		expect(config.signupPolicyMode).toBe('allowlist');
	});
});

describe('auth abuse hardening decisions', () => {
	it('blocks non-allowlisted emails when allowlist policy is active', () => {
		const decision = evaluateSignupAttempt(
			{
				path: '/sign-up/email',
				email: 'new-driver@driver.test',
				inviteCodeHeader: null
			},
			createPolicyConfig()
		);

		expect(decision).toMatchObject({ allowed: false, reason: 'allowlist_denied' });
	});

	it('allows allowlisted emails when allowlist policy is active', () => {
		const decision = evaluateSignupAttempt(
			{
				path: '/sign-up/email',
				email: 'approved@driver.test',
				inviteCodeHeader: null
			},
			createPolicyConfig()
		);

		expect(decision).toEqual({ allowed: true });
	});

	it('enforces invite code checks in non-production when configured', () => {
		const config = createPolicyConfig({
			isProduction: false,
			signupPolicyMode: 'open',
			allowlistedEmails: new Set(),
			localInviteCode: 'dev-only-invite'
		});

		const denied = evaluateSignupAttempt(
			{
				path: '/sign-up/email',
				email: 'anyone@driver.test',
				inviteCodeHeader: 'wrong-code'
			},
			config
		);

		expect(denied).toMatchObject({ allowed: false, reason: 'invalid_invite_code' });

		const allowed = evaluateSignupAttempt(
			{
				path: '/sign-up/email',
				email: 'anyone@driver.test',
				inviteCodeHeader: 'dev-only-invite'
			},
			config
		);

		expect(allowed).toEqual({ allowed: true });
	});

	it('does not use env allowlist checks in production mode', () => {
		const decision = evaluateSignupAttempt(
			{
				path: '/sign-up/email',
				email: 'new-driver@driver.test',
				inviteCodeHeader: null
			},
			createPolicyConfig({
				isProduction: true,
				signupPolicyMode: 'allowlist',
				allowlistedEmails: new Set()
			})
		);

		expect(decision).toEqual({ allowed: true });
	});

	it('does not apply invite code checks in production', () => {
		const decision = evaluateSignupAttempt(
			{
				path: '/sign-up/email',
				email: 'anyone@driver.test',
				inviteCodeHeader: null
			},
			createPolicyConfig({
				isProduction: true,
				signupPolicyMode: 'open',
				allowlistedEmails: new Set(),
				localInviteCode: 'should-not-apply'
			})
		);

		expect(decision).toEqual({ allowed: true });
	});

	it('bypasses checks for non-signup paths', () => {
		const decision = evaluateSignupAttempt(
			{
				path: '/sign-in/email',
				email: 'blocked@driver.test',
				inviteCodeHeader: null
			},
			createPolicyConfig()
		);

		expect(decision).toEqual({ allowed: true });
	});
});

describe('auth rate limit config', () => {
	it('uses persistent database storage with explicit auth rules', () => {
		const config = buildAuthRateLimitConfig();

		expect(config).toMatchObject({
			enabled: true,
			storage: 'database',
			window: 60,
			max: 60
		});
		expect(config.customRules).toEqual(AUTH_RATE_LIMIT_RULES);
		expect(config.customRules['/sign-up/*']).toEqual({ window: 900, max: 3 });
		expect(config.customRules['/sign-in/*']).toEqual({ window: 300, max: 5 });
	});
});
