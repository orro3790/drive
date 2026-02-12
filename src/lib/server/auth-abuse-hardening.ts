import { env } from '$env/dynamic/private';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import logger from './logger';
import { releaseProductionSignupAuthorizationReservation } from './services/onboarding';
import {
	finalizeOrganizationCreateSignup,
	finalizeOrganizationJoinSignup,
	reserveOrganizationJoinSignup
} from './services/organizationSignup';
import {
	authSignupReturnedPayloadSchema,
	signupOrganizationMetadataSchema,
	signupOnboardingReservationIdSchema,
	type SignupCreateOrganizationFinalizeReconciliationInput,
	type SignupOrganizationMetadata,
	type SignupFinalizeReconciliationInput
} from '$lib/schemas/onboarding';

const SIGN_UP_PATH = '/sign-up/email';
const ALLOWLIST_POLICY = 'allowlist';
const OPEN_POLICY = 'open';
const SIGNUP_POLICY_VALUES = new Set([ALLOWLIST_POLICY, OPEN_POLICY]);

const SIGN_UP_BLOCKED_MESSAGE = 'Signup is restricted. Please contact a manager for approval.';
const INVALID_INVITE_CODE_MESSAGE = 'Invalid invite code';
const INVALID_ORGANIZATION_CODE_MESSAGE = 'Invalid organization code';
const INVALID_ORGANIZATION_SIGNUP_MESSAGE = 'Invalid organization signup details';
const SIGNUP_ORGANIZATION_MODE_HEADER = 'x-signup-org-mode';
const SIGNUP_ORGANIZATION_NAME_HEADER = 'x-signup-org-name';
const SIGNUP_ORGANIZATION_CODE_HEADER = 'x-signup-org-code';

type RuntimeEnv = Record<string, string | undefined>;

export type SignupPolicyMode = 'allowlist' | 'open';

export interface SignupAbusePolicyConfig {
	isProduction: boolean;
	signupPolicyMode: SignupPolicyMode;
	allowlistedEmails: Set<string>;
	localInviteCode: string | null;
}

export interface SignupAbuseGuardDependencies {
	reserveOrganizationJoinSignup?: typeof reserveOrganizationJoinSignup;
	finalizeOrganizationJoinSignup?: typeof finalizeOrganizationJoinSignup;
	finalizeOrganizationCreateSignup?: typeof finalizeOrganizationCreateSignup;
	releaseProductionSignupAuthorizationReservation?: typeof releaseProductionSignupAuthorizationReservation;
	recordSignupFinalizeReconciliation?: (
		input: SignupFinalizeReconciliationInput
	) => Promise<void> | void;
	recordSignupCreateOrganizationFinalizeReconciliation?: (
		input: SignupCreateOrganizationFinalizeReconciliationInput
	) => Promise<void> | void;
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
	'/request-password-reset': { window: 10 * 60, max: 3 }
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

function parseSignupOrganizationMetadataFromHeaders(
	headers: Headers | undefined
): SignupOrganizationMetadata | null {
	if (!headers) {
		return null;
	}

	const mode = headers.get(SIGNUP_ORGANIZATION_MODE_HEADER)?.trim().toLowerCase();
	if (!mode) {
		return null;
	}

	if (mode === 'create') {
		const organizationName = headers.get(SIGNUP_ORGANIZATION_NAME_HEADER) ?? '';
		const parsed = signupOrganizationMetadataSchema.safeParse({
			mode,
			organizationName
		});
		return parsed.success ? parsed.data : null;
	}

	if (mode === 'join') {
		const organizationCode = headers.get(SIGNUP_ORGANIZATION_CODE_HEADER) ?? '';
		const parsed = signupOrganizationMetadataSchema.safeParse({
			mode,
			organizationCode
		});
		return parsed.success ? parsed.data : null;
	}

	return null;
}

function resolveOrganizationJoinFailureMessage(
	reason: 'invalid_org_code' | 'approval_not_found'
): string {
	if (reason === 'invalid_org_code') {
		return INVALID_ORGANIZATION_CODE_MESSAGE;
	}

	return SIGN_UP_BLOCKED_MESSAGE;
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
	const parsed = authSignupReturnedPayloadSchema.safeParse(payload);
	return parsed.success ? parsed.data.user : null;
}

interface SignupHookContext {
	returned?: unknown;
	signupOnboardingReservationId?: string;
	signupOrganization?: SignupOrganizationMetadata;
}

function setSignupReservationIdOnContext(ctx: { context?: unknown }, reservationId: string): void {
	const context =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext)
			: ({} as SignupHookContext);

	context.signupOnboardingReservationId = reservationId;
	(ctx as { context?: SignupHookContext }).context = context;
}

function setSignupOrganizationOnContext(
	ctx: { context?: unknown },
	signupOrganization: SignupOrganizationMetadata
): void {
	const context =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext)
			: ({} as SignupHookContext);

	context.signupOrganization = signupOrganization;
	(ctx as { context?: SignupHookContext }).context = context;
}

function getSignupReservationIdFromContext(ctx: { context?: unknown }): string | null {
	const reservationId =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext).signupOnboardingReservationId
			: null;

	if (typeof reservationId !== 'string') {
		return null;
	}

	const normalizedReservationId = reservationId.trim();
	const parsed = signupOnboardingReservationIdSchema.safeParse(normalizedReservationId);
	return parsed.success ? parsed.data : null;
}

function getSignupOrganizationFromContext(ctx: {
	context?: unknown;
}): SignupOrganizationMetadata | null {
	const signupOrganization =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext).signupOrganization
			: null;

	const parsed = signupOrganizationMetadataSchema.safeParse(signupOrganization);
	return parsed.success ? parsed.data : null;
}

function getReturnedHookValue(ctx: { context?: unknown }): unknown {
	if (typeof ctx.context !== 'object' || !ctx.context) {
		return null;
	}

	return (ctx.context as SignupHookContext).returned;
}

async function logSignupFinalizeNeedsReconciliation(
	input: SignupFinalizeReconciliationInput
): Promise<void> {
	logger.error(
		{
			reservationId: input.reservationId,
			emailDomain: emailDomain(input.email),
			userId: input.userId,
			error: input.error
		},
		'auth_signup_onboarding_finalize_needs_reconciliation'
	);
}

async function reportFinalizeReconciliation(
	recorder: NonNullable<SignupAbuseGuardDependencies['recordSignupFinalizeReconciliation']>,
	input: SignupFinalizeReconciliationInput
): Promise<void> {
	try {
		await recorder(input);
	} catch (error) {
		logger.error(
			{
				reservationId: input.reservationId,
				emailDomain: emailDomain(input.email),
				userId: input.userId,
				error
			},
			'auth_signup_onboarding_reconciliation_report_failed'
		);
	}
}

async function logSignupCreateOrganizationFinalizeNeedsReconciliation(
	input: SignupCreateOrganizationFinalizeReconciliationInput
): Promise<void> {
	logger.error(
		{
			emailDomain: emailDomain(input.email),
			userId: input.userId,
			organizationName: input.organizationName,
			error: input.error
		},
		'auth_signup_organization_create_finalize_needs_reconciliation'
	);
}

async function reportCreateOrganizationFinalizeReconciliation(
	recorder: NonNullable<
		SignupAbuseGuardDependencies['recordSignupCreateOrganizationFinalizeReconciliation']
	>,
	input: SignupCreateOrganizationFinalizeReconciliationInput
): Promise<void> {
	try {
		await recorder(input);
	} catch (error) {
		logger.error(
			{
				emailDomain: emailDomain(input.email),
				userId: input.userId,
				organizationName: input.organizationName,
				error
			},
			'auth_signup_organization_create_reconciliation_report_failed'
		);
	}
}

export function createSignupAbuseGuard(
	config = resolveSignupAbusePolicyConfig(),
	dependencies: SignupAbuseGuardDependencies = {}
) {
	const reserveJoinAuthorization =
		dependencies.reserveOrganizationJoinSignup ?? reserveOrganizationJoinSignup;

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

		const signupOrganization = parseSignupOrganizationMetadataFromHeaders(ctx.headers);
		if (!signupOrganization) {
			logger.warn(
				{
					reason: 'invalid_organization_signup',
					emailDomain: emailDomain(attempt.email),
					ip: extractClientIp(ctx.headers)
				},
				'auth_signup_blocked'
			);

			throw new APIError('BAD_REQUEST', { message: INVALID_ORGANIZATION_SIGNUP_MESSAGE });
		}

		setSignupOrganizationOnContext(ctx, signupOrganization);

		if (signupOrganization.mode === 'create') {
			return;
		}

		let reservation: Awaited<ReturnType<typeof reserveJoinAuthorization>> | null = null;

		try {
			reservation = await reserveJoinAuthorization({
				email: attempt.email!,
				organizationCode: signupOrganization.organizationCode
			});
		} catch (error) {
			logger.error(
				{
					emailDomain: emailDomain(attempt.email),
					ip: extractClientIp(ctx.headers),
					error
				},
				'auth_signup_onboarding_reserve_failed'
			);

			throw new APIError('BAD_REQUEST', { message: SIGN_UP_BLOCKED_MESSAGE });
		}

		if (reservation.allowed) {
			setSignupReservationIdOnContext(ctx, reservation.reservationId);
			return;
		}

		logger.warn(
			{
				reason: reservation.reason,
				emailDomain: emailDomain(attempt.email),
				ip: extractClientIp(ctx.headers),
				signupPolicyMode: config.signupPolicyMode,
				isProduction: config.isProduction
			},
			'auth_signup_blocked'
		);

		throw new APIError('BAD_REQUEST', {
			message: resolveOrganizationJoinFailureMessage(reservation.reason)
		});
	});
}

export function createSignupOnboardingConsumer(
	_config = resolveSignupAbusePolicyConfig(),
	dependencies: SignupAbuseGuardDependencies = {}
) {
	const finalizeJoinReservation =
		dependencies.finalizeOrganizationJoinSignup ?? finalizeOrganizationJoinSignup;
	const finalizeCreateOrganization =
		dependencies.finalizeOrganizationCreateSignup ?? finalizeOrganizationCreateSignup;
	const releaseReservation =
		dependencies.releaseProductionSignupAuthorizationReservation ??
		releaseProductionSignupAuthorizationReservation;
	const recordFinalizeReconciliation =
		dependencies.recordSignupFinalizeReconciliation ?? logSignupFinalizeNeedsReconciliation;
	const recordCreateOrganizationFinalizeReconciliation =
		dependencies.recordSignupCreateOrganizationFinalizeReconciliation ??
		logSignupCreateOrganizationFinalizeNeedsReconciliation;

	const releaseSignupReservation = async (reservationId: string) => {
		try {
			const released = await releaseReservation({ reservationId });
			if (!released) {
				logger.warn({ reservationId }, 'auth_signup_onboarding_release_not_applied');
			}
		} catch (error) {
			logger.error(
				{
					reservationId,
					error
				},
				'auth_signup_onboarding_release_failed'
			);
		}
	};

	return createAuthMiddleware(async (ctx) => {
		if (ctx.path !== SIGN_UP_PATH) {
			return;
		}

		const signupOrganization = getSignupOrganizationFromContext(ctx);
		if (!signupOrganization) {
			logger.error(
				{
					ip: extractClientIp(ctx.headers)
				},
				'auth_signup_organization_context_missing'
			);
			return;
		}

		const payload = await extractSuccessfulAuthPayload(getReturnedHookValue(ctx));
		const signedUpUser = payload ? extractSignedUpUser(payload) : null;

		if (!signedUpUser) {
			if (signupOrganization.mode === 'join') {
				const reservationId = getSignupReservationIdFromContext(ctx);
				if (!reservationId) {
					logger.error(
						{
							ip: extractClientIp(ctx.headers)
						},
						'auth_signup_onboarding_reservation_missing'
					);
					return;
				}

				await releaseSignupReservation(reservationId);
			}

			return;
		}

		if (signupOrganization.mode === 'create') {
			try {
				const finalized = await finalizeCreateOrganization({
					userId: signedUpUser.id,
					organizationName: signupOrganization.organizationName
				});

				if (!finalized) {
					await reportCreateOrganizationFinalizeReconciliation(
						recordCreateOrganizationFinalizeReconciliation,
						{
							userId: signedUpUser.id,
							email: signedUpUser.email,
							organizationName: signupOrganization.organizationName
						}
					);
				}
			} catch (error) {
				await reportCreateOrganizationFinalizeReconciliation(
					recordCreateOrganizationFinalizeReconciliation,
					{
						userId: signedUpUser.id,
						email: signedUpUser.email,
						organizationName: signupOrganization.organizationName,
						error
					}
				);
			}

			return;
		}

		const reservationId = getSignupReservationIdFromContext(ctx);
		if (!reservationId) {
			logger.error(
				{
					ip: extractClientIp(ctx.headers)
				},
				'auth_signup_onboarding_reservation_missing'
			);
			return;
		}

		try {
			const finalized = await finalizeJoinReservation({
				reservationId,
				userId: signedUpUser.id
			});

			if (!finalized) {
				await reportFinalizeReconciliation(recordFinalizeReconciliation, {
					reservationId,
					userId: signedUpUser.id,
					email: signedUpUser.email
				});
			}
		} catch (error) {
			await reportFinalizeReconciliation(recordFinalizeReconciliation, {
				reservationId,
				userId: signedUpUser.id,
				email: signedUpUser.email,
				error
			});
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
