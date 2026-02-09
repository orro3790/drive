import { env } from '$env/dynamic/private';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import logger from './logger';
import {
	consumeProductionSignupAuthorization,
	resolveProductionSignupAuthorization
} from './services/onboarding';

const SIGN_UP_PATH = '/sign-up/email';
const ALLOWLIST_POLICY = 'allowlist';
const OPEN_POLICY = 'open';
const SIGNUP_POLICY_VALUES = new Set([ALLOWLIST_POLICY, OPEN_POLICY]);

const SIGN_UP_BLOCKED_MESSAGE = 'Signup is restricted. Please contact a manager for approval.';
const INVALID_INVITE_CODE_MESSAGE = 'Invalid invite code';

type RuntimeEnv = Record<string, string | undefined>;

export type SignupPolicyMode = 'allowlist' | 'open';

export interface SignupAbusePolicyConfig {
	isProduction: boolean;
	signupPolicyMode: SignupPolicyMode;
	allowlistedEmails: Set<string>;
	localInviteCode: string | null;
}

export interface SignupAbuseGuardDependencies {
	resolveProductionSignupAuthorization?: typeof resolveProductionSignupAuthorization;
	consumeProductionSignupAuthorization?: typeof consumeProductionSignupAuthorization;
}

interface SignupAttempt {
	path: string;
	email: string | null;
	inviteCodeHeader: string | null;
}

type SignupDecision =
	| { allowed: true }
	| {
			allowed: false;
			reason: 'allowlist_denied' | 'invalid_invite_code' | 'missing_email';
			message: string;
	  };

type RateLimitRule = { window: number; max: number };

export const AUTH_RATE_LIMIT_RULES: Record<string, RateLimitRule> = {
	'/sign-up/*': { window: 15 * 60, max: 3 },
	'/sign-in/*': { window: 5 * 60, max: 5 },
	'/forget-password': { window: 10 * 60, max: 3 }
};

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function normalizeInviteCode(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function parseAllowlistedSignupEmails(value: string | undefined): Set<string> {
	if (!value) {
		return new Set<string>();
	}

	const normalized = value
		.split(/[\n,;]+/)
		.map((email) => normalizeEmail(email))
		.filter((email) => email.length > 0);

	return new Set(normalized);
}

function resolveSignupPolicyMode(runtimeEnv: RuntimeEnv, isProduction: boolean): SignupPolicyMode {
	const fallbackMode: SignupPolicyMode = isProduction ? ALLOWLIST_POLICY : OPEN_POLICY;
	const configuredPolicy = runtimeEnv.BETTER_AUTH_SIGNUP_POLICY?.trim().toLowerCase();

	if (!configuredPolicy) {
		return fallbackMode;
	}

	return SIGNUP_POLICY_VALUES.has(configuredPolicy)
		? (configuredPolicy as SignupPolicyMode)
		: fallbackMode;
}

export function resolveSignupAbusePolicyConfig(
	runtimeEnv: RuntimeEnv = env
): SignupAbusePolicyConfig {
	const isProduction = runtimeEnv.NODE_ENV === 'production';

	return {
		isProduction,
		signupPolicyMode: resolveSignupPolicyMode(runtimeEnv, isProduction),
		allowlistedEmails: parseAllowlistedSignupEmails(runtimeEnv.BETTER_AUTH_SIGNUP_ALLOWLIST),
		localInviteCode: normalizeInviteCode(runtimeEnv.BETTER_AUTH_INVITE_CODE)
	};
}

export function evaluateSignupAttempt(
	attempt: SignupAttempt,
	config: SignupAbusePolicyConfig
): SignupDecision {
	if (attempt.path !== SIGN_UP_PATH) {
		return { allowed: true };
	}

	if (!attempt.email) {
		return {
			allowed: false,
			reason: 'missing_email',
			message: SIGN_UP_BLOCKED_MESSAGE
		};
	}

	const normalizedEmail = normalizeEmail(attempt.email);

	if (
		config.signupPolicyMode === ALLOWLIST_POLICY &&
		!config.isProduction &&
		!config.allowlistedEmails.has(normalizedEmail)
	) {
		return {
			allowed: false,
			reason: 'allowlist_denied',
			message: SIGN_UP_BLOCKED_MESSAGE
		};
	}

	if (!config.isProduction && config.localInviteCode) {
		const suppliedInviteCode = normalizeInviteCode(attempt.inviteCodeHeader);
		if (!suppliedInviteCode || suppliedInviteCode !== config.localInviteCode) {
			return {
				allowed: false,
				reason: 'invalid_invite_code',
				message: INVALID_INVITE_CODE_MESSAGE
			};
		}
	}

	return { allowed: true };
}

function emailDomain(email: string | null): string | null {
	if (!email) {
		return null;
	}

	const atIndex = email.indexOf('@');
	if (atIndex < 0 || atIndex === email.length - 1) {
		return null;
	}

	return email.slice(atIndex + 1).toLowerCase();
}

function extractClientIp(headers: Headers | undefined): string | null {
	if (!headers) {
		return null;
	}

	const forwardedFor = headers.get('x-forwarded-for');
	if (!forwardedFor) {
		return headers.get('x-real-ip');
	}

	return forwardedFor.split(',')[0]?.trim() || null;
}

function isProductionAllowlistMode(config: SignupAbusePolicyConfig): boolean {
	return config.isProduction && config.signupPolicyMode === ALLOWLIST_POLICY;
}

async function extractSuccessfulAuthPayload(
	returned: unknown
): Promise<Record<string, unknown> | null> {
	if (!returned) {
		return null;
	}

	if (returned instanceof Response) {
		if (returned.status !== 200) {
			return null;
		}

		const payload = await returned
			.clone()
			.json()
			.catch(() => null);
		if (!payload || typeof payload !== 'object') {
			return null;
		}

		return payload as Record<string, unknown>;
	}

	if (returned instanceof APIError) {
		return null;
	}

	if (typeof returned !== 'object') {
		return null;
	}

	return returned as Record<string, unknown>;
}

function extractSignedUpUser(
	payload: Record<string, unknown>
): { id: string; email: string } | null {
	const user = payload.user;
	if (!user || typeof user !== 'object') {
		return null;
	}

	const candidate = user as { id?: unknown; email?: unknown };
	if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') {
		return null;
	}

	return {
		id: candidate.id,
		email: candidate.email
	};
}

export function createSignupAbuseGuard(
	config = resolveSignupAbusePolicyConfig(),
	dependencies: SignupAbuseGuardDependencies = {}
) {
	const resolveProductionAuthorization =
		dependencies.resolveProductionSignupAuthorization ?? resolveProductionSignupAuthorization;

	return createAuthMiddleware(async (ctx) => {
		if (ctx.path !== SIGN_UP_PATH) {
			return;
		}

		const attempt: SignupAttempt = {
			path: ctx.path,
			email: typeof ctx.body?.email === 'string' ? ctx.body.email : null,
			inviteCodeHeader: ctx.headers?.get?.('x-invite-code') ?? null
		};

		const decision = evaluateSignupAttempt(attempt, config);
		if (!decision.allowed) {
			logger.warn(
				{
					reason: decision.reason,
					emailDomain: emailDomain(attempt.email),
					ip: extractClientIp(ctx.headers),
					signupPolicyMode: config.signupPolicyMode,
					isProduction: config.isProduction
				},
				'auth_signup_blocked'
			);

			throw new APIError('BAD_REQUEST', { message: decision.message });
		}

		if (isProductionAllowlistMode(config)) {
			const authorization = await resolveProductionAuthorization({
				email: attempt.email!,
				inviteCodeHeader: attempt.inviteCodeHeader
			});

			if (authorization.allowed) {
				return;
			}

			logger.warn(
				{
					reason: 'allowlist_denied',
					emailDomain: emailDomain(attempt.email),
					ip: extractClientIp(ctx.headers),
					signupPolicyMode: config.signupPolicyMode,
					isProduction: config.isProduction
				},
				'auth_signup_blocked'
			);

			throw new APIError('BAD_REQUEST', { message: SIGN_UP_BLOCKED_MESSAGE });
		}

		return;
	});
}

export function createSignupOnboardingConsumer(
	config = resolveSignupAbusePolicyConfig(),
	dependencies: SignupAbuseGuardDependencies = {}
) {
	const consumeAuthorization =
		dependencies.consumeProductionSignupAuthorization ?? consumeProductionSignupAuthorization;

	return createAuthMiddleware(async (ctx) => {
		if (ctx.path !== SIGN_UP_PATH) {
			return;
		}

		if (!isProductionAllowlistMode(config)) {
			return;
		}

		const payload = await extractSuccessfulAuthPayload(ctx.context.returned);
		if (!payload) {
			return;
		}

		const signedUpUser = extractSignedUpUser(payload);
		if (!signedUpUser) {
			return;
		}

		try {
			const consumed = await consumeAuthorization({
				email: signedUpUser.email,
				userId: signedUpUser.id,
				inviteCodeHeader: ctx.headers?.get?.('x-invite-code') ?? null
			});

			if (!consumed) {
				logger.warn(
					{
						emailDomain: emailDomain(signedUpUser.email),
						userId: signedUpUser.id
					},
					'auth_signup_onboarding_not_consumed'
				);
			}
		} catch (error) {
			logger.error(
				{
					emailDomain: emailDomain(signedUpUser.email),
					userId: signedUpUser.id,
					error
				},
				'auth_signup_onboarding_consume_failed'
			);
		}
	});
}

export function buildAuthRateLimitConfig() {
	return {
		enabled: true,
		storage: 'database' as const,
		window: 60,
		max: 60,
		customRules: AUTH_RATE_LIMIT_RULES
	};
}
