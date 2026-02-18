import { env } from '$env/dynamic/private';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import logger from './logger';
import { db } from '$lib/server/db';
import { rateLimit as authRateLimit, user as authUser } from './db/auth-schema';
import { releaseProductionSignupAuthorizationReservation } from './services/onboarding';
import {
	prepareOrganizationCreateSignup,
	finalizeOrganizationCreateSignup,
	finalizeOrganizationJoinSignup,
	reserveOrganizationJoinSignup
} from './services/organizationSignup';
import {
	applicationUserRoleSchema,
	authSignupReturnedPayloadSchema,
	signupOrganizationIdSchema,
	signupOrganizationMetadataSchema,
	signupOnboardingReservationIdSchema,
	type SignupCreateOrganizationFinalizeReconciliationInput,
	type ApplicationUserRole,
	type SignupOrganizationMetadata,
	type SignupFinalizeReconciliationInput
} from '$lib/schemas/onboarding';

const SIGN_UP_PATH = '/sign-up/email';
const ADMIN_CREATE_USER_PATH = '/admin/create-user';
const ALLOWLIST_POLICY = 'allowlist';
const OPEN_POLICY = 'open';
const SIGNUP_POLICY_VALUES = new Set([ALLOWLIST_POLICY, OPEN_POLICY]);

const SIGN_UP_BLOCKED_MESSAGE = 'Signup is restricted. Please contact a manager for approval.';
const INVALID_INVITE_CODE_MESSAGE = 'Invalid invite code';
const INVALID_ORGANIZATION_CODE_MESSAGE = 'Invalid organization code';
const INVALID_ORGANIZATION_SIGNUP_MESSAGE = 'Invalid organization signup details';
const MISSING_SIGNUP_ASSIGNMENT_MESSAGE = 'Missing signup organization assignment';
const UNSUPPORTED_USER_CREATION_PATH_MESSAGE =
	'User creation requires explicit organization assignment';
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
	prepareOrganizationCreateSignup?: typeof prepareOrganizationCreateSignup;
	finalizeOrganizationJoinSignup?: typeof finalizeOrganizationJoinSignup;
	finalizeOrganizationCreateSignup?: typeof finalizeOrganizationCreateSignup;
	releaseProductionSignupAuthorizationReservation?: typeof releaseProductionSignupAuthorizationReservation;
	rollbackSignupUser?: (input: { userId: string }) => Promise<void> | void;
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

type AuthRateLimitCustomRule = RateLimitRule | false;

const SIGN_IN_PATH = '/sign-in/email';
const SIGN_IN_FAILURE_EMAIL_RULE: RateLimitRule = { window: 5 * 60, max: 20 };

function createSignInFailureEmailKey(normalizedEmail: string): string {
	return `email:${normalizedEmail}|${SIGN_IN_PATH}`;
}

function isRateLimitActive(entry: { lastRequest: number }, rule: RateLimitRule): boolean {
	return Date.now() - entry.lastRequest < rule.window * 1000;
}

function getRetryAfterSeconds(entry: { lastRequest: number }, rule: RateLimitRule): number {
	const windowMs = rule.window * 1000;
	const remainingMs = entry.lastRequest + windowMs - Date.now();
	return Math.max(1, Math.ceil(remainingMs / 1000));
}

async function getAuthRateLimitEntry(
	key: string
): Promise<{ count: number; lastRequest: number } | null> {
	const [row] = await db
		.select({
			count: authRateLimit.count,
			lastRequest: authRateLimit.lastRequest
		})
		.from(authRateLimit)
		.where(eq(authRateLimit.key, key));

	if (!row) {
		return null;
	}

	return {
		count: row.count,
		lastRequest: Number(row.lastRequest)
	};
}

async function clearAuthRateLimitEntry(key: string): Promise<void> {
	await db.delete(authRateLimit).where(eq(authRateLimit.key, key));
}

async function recordAuthRateLimitHit(key: string, rule: RateLimitRule): Promise<void> {
	const now = Date.now();
	const windowMs = rule.window * 1000;

	await db
		.insert(authRateLimit)
		.values({
			id: randomUUID(),
			key,
			count: 1,
			lastRequest: now
		})
		.onConflictDoUpdate({
			target: authRateLimit.key,
			set: {
				count: sql`CASE WHEN (${now} - ${authRateLimit.lastRequest}) > ${windowMs} THEN 1 ELSE ${authRateLimit.count} + 1 END`,
				lastRequest: now
			}
		});
}

function isSignInSuccess(returned: unknown): boolean {
	if (!returned) {
		return false;
	}

	if (returned instanceof Response) {
		return returned.status === 200;
	}

	if (returned instanceof APIError) {
		return false;
	}

	if (typeof returned === 'object') {
		const token = (returned as { token?: unknown }).token;
		return typeof token === 'string' && token.trim().length > 0;
	}

	return false;
}

export const AUTH_RATE_LIMIT_RULES: Record<string, AuthRateLimitCustomRule> = {
	'/sign-up/*': { window: 15 * 60, max: 3 },
	// Better Auth rate limiting is keyed by IP + path (not email).
	// For sign-in, we enforce a per-email failure throttle below to avoid cross-user lockouts on shared IPs.
	'/sign-in/*': false,
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

type SignupAssignmentSource = 'join_reservation' | 'create_provision' | 'explicit_non_signup';

export interface SignupOrganizationAssignmentContext {
	organizationId: string;
	role: ApplicationUserRole;
	source: SignupAssignmentSource;
	reservationId?: string;
}

interface SignupHookContext {
	returned?: unknown;
	signupOnboardingReservationId?: string;
	signupOrganization?: SignupOrganizationMetadata;
	signupOrganizationAssignment?: SignupOrganizationAssignmentContext;
}

function getMutableSignupHookContext(ctx: { context?: unknown }): SignupHookContext {
	const context =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext)
			: ({} as SignupHookContext);

	(ctx as { context?: SignupHookContext }).context = context;
	return context;
}

function normalizeApplicationUserRole(value: unknown): ApplicationUserRole | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalizedRole = value.trim().toLowerCase();
	if (normalizedRole === 'user') {
		return 'driver';
	}

	const parsedRole = applicationUserRoleSchema.safeParse(normalizedRole);
	return parsedRole.success ? parsedRole.data : null;
}

function normalizeOrganizationId(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalizedOrganizationId = value.trim();
	const parsedOrganizationId = signupOrganizationIdSchema.safeParse(normalizedOrganizationId);
	return parsedOrganizationId.success ? parsedOrganizationId.data : null;
}

function setSignupReservationIdOnContext(ctx: { context?: unknown }, reservationId: string): void {
	const context = getMutableSignupHookContext(ctx);
	context.signupOnboardingReservationId = reservationId;
}

export function setSignupOrganizationOnContext(
	ctx: { context?: unknown },
	signupOrganization: SignupOrganizationMetadata
): void {
	const context = getMutableSignupHookContext(ctx);
	context.signupOrganization = signupOrganization;
}

export function setSignupOrganizationAssignmentOnContext(
	ctx: { context?: unknown },
	assignment: SignupOrganizationAssignmentContext
): void {
	const context = getMutableSignupHookContext(ctx);
	context.signupOrganizationAssignment = assignment;
}

export function resolveExplicitOrganizationAssignment(
	userData: Record<string, unknown>
): SignupOrganizationAssignmentContext | null {
	const organizationId = normalizeOrganizationId(userData.organizationId);
	if (!organizationId) {
		return null;
	}

	const resolvedRole = normalizeApplicationUserRole(userData.role) ?? 'driver';
	return {
		organizationId,
		role: resolvedRole,
		source: 'explicit_non_signup'
	};
}

export function getSignupReservationIdFromContext(ctx: { context?: unknown }): string | null {
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

export function getSignupOrganizationFromContext(ctx: {
	context?: unknown;
}): SignupOrganizationMetadata | null {
	const signupOrganization =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext).signupOrganization
			: null;

	const parsed = signupOrganizationMetadataSchema.safeParse(signupOrganization);
	return parsed.success ? parsed.data : null;
}

export function getSignupOrganizationAssignmentFromContext(ctx: {
	context?: unknown;
}): SignupOrganizationAssignmentContext | null {
	const assignment =
		typeof ctx.context === 'object' && ctx.context
			? (ctx.context as SignupHookContext).signupOrganizationAssignment
			: null;

	if (!assignment || typeof assignment !== 'object') {
		return null;
	}

	const organizationId = normalizeOrganizationId(
		(assignment as { organizationId?: unknown }).organizationId
	);
	const role = normalizeApplicationUserRole((assignment as { role?: unknown }).role);
	const source = (assignment as { source?: unknown }).source;

	if (
		!organizationId ||
		!role ||
		(source !== 'join_reservation' &&
			source !== 'create_provision' &&
			source !== 'explicit_non_signup')
	) {
		return null;
	}

	const reservationId =
		typeof (assignment as { reservationId?: unknown }).reservationId === 'string'
			? (assignment as { reservationId: string }).reservationId
			: undefined;

	return {
		organizationId,
		role,
		source,
		...(reservationId ? { reservationId } : {})
	};
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
			event: 'auth.signup.finalize.join.needs_reconciliation',
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
				event: 'auth.signup.finalize.join.reconciliation_report_failed',
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
			event: 'auth.signup.finalize.create.needs_reconciliation',
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
				event: 'auth.signup.finalize.create.reconciliation_report_failed',
				emailDomain: emailDomain(input.email),
				userId: input.userId,
				organizationName: input.organizationName,
				error
			},
			'auth_signup_organization_create_reconciliation_report_failed'
		);
	}
}

async function rollbackSignupUser(input: { userId: string }): Promise<void> {
	const [deletedUser] = await db
		.delete(authUser)
		.where(eq(authUser.id, input.userId))
		.returning({ id: authUser.id });

	if (!deletedUser) {
		logger.error(
			{ event: 'auth.signup.rollback.user_missing', userId: input.userId },
			'auth_signup_rollback_user_missing'
		);
	}
}

type SignupDatabaseHookContext = {
	path?: string;
	body?: unknown;
	context?: unknown;
};

function resolveUserCreationPath(ctx: SignupDatabaseHookContext | null): string | null {
	if (!ctx || typeof ctx.path !== 'string') {
		return null;
	}

	return ctx.path;
}

function resolveUserCreateFailureMessage(path: string | null): string {
	if (path === ADMIN_CREATE_USER_PATH) {
		return `${UNSUPPORTED_USER_CREATION_PATH_MESSAGE}: include data.organizationId`;
	}

	return UNSUPPORTED_USER_CREATION_PATH_MESSAGE;
}

export function createSignupOrganizationAssignmentDbHook(
	dependencies: SignupAbuseGuardDependencies = {}
) {
	const provisionCreateOrganization =
		dependencies.prepareOrganizationCreateSignup ?? prepareOrganizationCreateSignup;

	return async (
		userData: Record<string, unknown>,
		ctx: SignupDatabaseHookContext | null
	): Promise<{ data: { organizationId: string; role: ApplicationUserRole } }> => {
		const path = resolveUserCreationPath(ctx);

		if (path === SIGN_UP_PATH) {
			const signupOrganization = ctx ? getSignupOrganizationFromContext(ctx) : null;
			if (!signupOrganization) {
				logger.error(
					{ event: 'auth.signup.assignment.before_hook_context_missing', path },
					'auth_signup_assignment_before_hook_context_missing'
				);
				throw new APIError('BAD_REQUEST', { message: INVALID_ORGANIZATION_SIGNUP_MESSAGE });
			}

			if (signupOrganization.mode === 'join') {
				const reservationId = ctx ? getSignupReservationIdFromContext(ctx) : null;
				const assignment = ctx ? getSignupOrganizationAssignmentFromContext(ctx) : null;

				if (
					!reservationId ||
					!assignment ||
					assignment.source !== 'join_reservation' ||
					assignment.reservationId !== reservationId
				) {
					logger.error(
						{ event: 'auth.signup.assignment.join_context_missing', path },
						'auth_signup_assignment_join_context_missing'
					);
					throw new APIError('BAD_REQUEST', { message: MISSING_SIGNUP_ASSIGNMENT_MESSAGE });
				}

				return {
					data: {
						organizationId: assignment.organizationId,
						role: assignment.role
					}
				};
			}

			const existingAssignment = ctx ? getSignupOrganizationAssignmentFromContext(ctx) : null;
			if (existingAssignment?.source === 'create_provision') {
				return {
					data: {
						organizationId: existingAssignment.organizationId,
						role: existingAssignment.role
					}
				};
			}

			let preparedOrganization: Awaited<ReturnType<typeof provisionCreateOrganization>> | null =
				null;
			try {
				preparedOrganization = await provisionCreateOrganization({
					organizationName: signupOrganization.organizationName
				});
			} catch (error) {
				logger.error(
					{
						event: 'auth.signup.assignment.create_provision_failed',
						error,
						path
					},
					'auth_signup_create_org_provision_failed'
				);
				throw new APIError('BAD_REQUEST', { message: SIGN_UP_BLOCKED_MESSAGE });
			}

			if (!preparedOrganization?.organizationId) {
				logger.error(
					{ event: 'auth.signup.assignment.create_context_missing', path },
					'auth_signup_assignment_create_context_missing'
				);
				throw new APIError('BAD_REQUEST', { message: MISSING_SIGNUP_ASSIGNMENT_MESSAGE });
			}

			const assignment: SignupOrganizationAssignmentContext = {
				organizationId: preparedOrganization.organizationId,
				role: 'manager',
				source: 'create_provision'
			};

			if (ctx) {
				setSignupOrganizationAssignmentOnContext(ctx, assignment);
			}

			return {
				data: {
					organizationId: assignment.organizationId,
					role: assignment.role
				}
			};
		}

		const explicitAssignment = resolveExplicitOrganizationAssignment(userData);
		if (explicitAssignment) {
			if (ctx) {
				setSignupOrganizationAssignmentOnContext(ctx, explicitAssignment);
			}

			return {
				data: {
					organizationId: explicitAssignment.organizationId,
					role: explicitAssignment.role
				}
			};
		}

		logger.warn(
			{ event: 'auth.signup.assignment.non_signup_missing', path: path ?? 'unknown' },
			'auth_user_create_blocked_missing_org_assignment'
		);
		throw new APIError('BAD_REQUEST', {
			message: resolveUserCreateFailureMessage(path)
		});
	};
}

export function createSignupAbuseGuard(
	config = resolveSignupAbusePolicyConfig(),
	dependencies: SignupAbuseGuardDependencies = {}
) {
	const reserveJoinAuthorization =
		dependencies.reserveOrganizationJoinSignup ?? reserveOrganizationJoinSignup;

	return createAuthMiddleware(async (ctx) => {
		if (ctx.path === SIGN_IN_PATH) {
			const email = typeof ctx.body?.email === 'string' ? ctx.body.email : null;
			if (!email) {
				return;
			}

			const normalizedEmail = normalizeEmail(email);
			const key = createSignInFailureEmailKey(normalizedEmail);
			const existing = await getAuthRateLimitEntry(key);
			if (!existing) {
				return;
			}

			if (
				isRateLimitActive(existing, SIGN_IN_FAILURE_EMAIL_RULE) &&
				existing.count >= SIGN_IN_FAILURE_EMAIL_RULE.max
			) {
				throw new APIError(
					'TOO_MANY_REQUESTS',
					{ message: 'Too many requests. Please try again later.' },
					{ 'X-Retry-After': String(getRetryAfterSeconds(existing, SIGN_IN_FAILURE_EMAIL_RULE)) }
				);
			}

			return;
		}

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
			setSignupOrganizationAssignmentOnContext(ctx, {
				organizationId: reservation.organizationId,
				role: reservation.targetRole,
				source: 'join_reservation',
				reservationId: reservation.reservationId
			});
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
	const rollbackUser = dependencies.rollbackSignupUser ?? rollbackSignupUser;
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
		if (ctx.path === SIGN_IN_PATH) {
			const email = typeof ctx.body?.email === 'string' ? ctx.body.email : null;
			if (!email) {
				return;
			}

			const normalizedEmail = normalizeEmail(email);
			const key = createSignInFailureEmailKey(normalizedEmail);
			const returned = getReturnedHookValue(ctx);

			if (isSignInSuccess(returned)) {
				await clearAuthRateLimitEntry(key);
				return;
			}

			// Only count failures for the per-email throttle.
			await recordAuthRateLimitHit(key, SIGN_IN_FAILURE_EMAIL_RULE);
			return;
		}

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

		const signupAssignment = getSignupOrganizationAssignmentFromContext(ctx);

		const payload = await extractSuccessfulAuthPayload(getReturnedHookValue(ctx));
		const signedUpUser = payload ? extractSignedUpUser(payload) : null;

		if (!signedUpUser) {
			if (signupOrganization.mode === 'create' && signupAssignment?.source === 'create_provision') {
				logger.warn(
					{ organizationId: signupAssignment.organizationId },
					'auth_signup_create_org_provisioned_without_user'
				);
			}

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
			if (!signupAssignment || signupAssignment.source !== 'create_provision') {
				await reportCreateOrganizationFinalizeReconciliation(
					recordCreateOrganizationFinalizeReconciliation,
					{
						userId: signedUpUser.id,
						email: signedUpUser.email,
						organizationName: signupOrganization.organizationName,
						error: new Error('signup_create_assignment_missing')
					}
				);
				return;
			}

			try {
				const finalized = await finalizeCreateOrganization({
					userId: signedUpUser.id,
					organizationId: signupAssignment.organizationId
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

		const rollbackUserAndBlockSignup = async (reconciliationError?: unknown) => {
			await reportFinalizeReconciliation(recordFinalizeReconciliation, {
				reservationId,
				userId: signedUpUser.id,
				email: signedUpUser.email,
				...(reconciliationError ? { error: reconciliationError } : {})
			});

			try {
				await rollbackUser({ userId: signedUpUser.id });
			} catch (rollbackError) {
				logger.error(
					{
						event: 'auth.signup.rollback.user_failed',
						reservationId,
						userId: signedUpUser.id,
						error: rollbackError
					},
					'auth_signup_rollback_user_failed'
				);
			}

			throw new APIError('BAD_REQUEST', { message: SIGN_UP_BLOCKED_MESSAGE });
		};

		let finalized: Awaited<ReturnType<typeof finalizeJoinReservation>> | null = null;
		try {
			finalized = await finalizeJoinReservation({
				reservationId,
				userId: signedUpUser.id
			});
		} catch (error) {
			await rollbackUserAndBlockSignup(error);
		}

		if (!finalized) {
			await rollbackUserAndBlockSignup();
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
