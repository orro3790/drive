import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { user } from '$lib/server/db/auth-schema';
import {
	organizationDispatchSettings,
	organizations,
	signupOnboarding
} from '$lib/server/db/schema';
import {
	signupOnboardingReservationIdSchema,
	signupOrganizationRoleSchema,
	type SignupOrganizationRole
} from '$lib/schemas/onboarding';

const ORGANIZATION_SLUG_MAX_LENGTH = 48;
const ORGANIZATION_SLUG_SUFFIX_BYTES = 2;
const ORGANIZATION_JOIN_CODE_BYTES = 6;
const RESERVATION_TIMEOUT_MS = 10 * 60 * 1000;
const PENDING_APPROVAL_UNIQUE_CONSTRAINT = 'uq_signup_onboarding_pending_org_email_kind_role';
const ORGANIZATION_UNIQUE_CONSTRAINTS = new Set([
	'uq_organizations_slug',
	'uq_organizations_join_code_hash'
]);

type DbClient = typeof db;

export interface ReserveOrganizationJoinSignupInput {
	email: string;
	organizationCode: string;
	now?: Date;
}

export type ReserveOrganizationJoinSignupResult =
	| {
			allowed: true;
			reservationId: string;
			organizationId: string;
			targetRole: SignupOrganizationRole;
	  }
	| {
			allowed: false;
			reason: 'invalid_org_code' | 'approval_not_found';
	  };

export interface FinalizeOrganizationJoinSignupInput {
	reservationId: string;
	userId: string;
	now?: Date;
}

export interface FinalizeOrganizationJoinSignupResult {
	reservationId: string;
	organizationId: string;
	targetRole: SignupOrganizationRole;
}

export interface FinalizeOrganizationCreateSignupInput {
	userId: string;
	organizationName: string;
	now?: Date;
}

export interface FinalizeOrganizationCreateSignupResult {
	organizationId: string;
	organizationSlug: string;
	organizationJoinCode: string;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function normalizeOrganizationCode(value: string): string {
	return value.trim().toUpperCase();
}

export function hashOrganizationCode(organizationCode: string): string {
	return createHash('sha256').update(normalizeOrganizationCode(organizationCode)).digest('hex');
}

function normalizeOrganizationName(organizationName: string): string {
	return organizationName.trim().replace(/\s+/g, ' ');
}

function normalizeReservationId(reservationId: string): string | null {
	const normalized = reservationId.trim();
	const parsed = signupOnboardingReservationIdSchema.safeParse(normalized);
	return parsed.success ? parsed.data : null;
}

function toOrganizationSlugBase(organizationName: string): string {
	const slug = organizationName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-+/g, '-');

	if (!slug) {
		return 'organization';
	}

	return slug.slice(0, ORGANIZATION_SLUG_MAX_LENGTH).replace(/-+$/g, '') || 'organization';
}

function withSlugSuffix(baseSlug: string, suffix: string): string {
	const maxBaseLength = Math.max(1, ORGANIZATION_SLUG_MAX_LENGTH - suffix.length - 1);
	const trimmedBase = baseSlug.slice(0, maxBaseLength).replace(/-+$/g, '') || 'organization';
	return `${trimmedBase}-${suffix}`;
}

function generateOrganizationJoinCode(): string {
	return randomBytes(ORGANIZATION_JOIN_CODE_BYTES).toString('hex').toUpperCase();
}

function extractDatabaseError(error: unknown): {
	code: string | null;
	constraint: string | null;
	message: string | null;
} {
	let current: unknown = error;

	for (let depth = 0; depth < 3 && current; depth += 1) {
		if (typeof current !== 'object' || !current) {
			break;
		}

		const candidate = current as {
			code?: unknown;
			constraint?: unknown;
			message?: unknown;
			cause?: unknown;
		};

		const code = typeof candidate.code === 'string' ? candidate.code : null;
		const constraint = typeof candidate.constraint === 'string' ? candidate.constraint : null;
		const message = typeof candidate.message === 'string' ? candidate.message : null;

		if (code || constraint || message) {
			return { code, constraint, message };
		}

		current = candidate.cause;
	}

	return {
		code: null,
		constraint: null,
		message: null
	};
}

function isOrganizationUniqueViolation(error: unknown): boolean {
	const dbError = extractDatabaseError(error);

	if (dbError.code !== '23505') {
		return false;
	}

	if (dbError.constraint && ORGANIZATION_UNIQUE_CONSTRAINTS.has(dbError.constraint)) {
		return true;
	}

	if (!dbError.message) {
		return false;
	}

	for (const constraint of ORGANIZATION_UNIQUE_CONSTRAINTS) {
		if (dbError.message.includes(constraint)) {
			return true;
		}
	}

	return false;
}

function isPendingApprovalUniqueViolation(error: unknown): boolean {
	const dbError = extractDatabaseError(error);

	if (dbError.code !== '23505') {
		return false;
	}

	if (dbError.constraint === PENDING_APPROVAL_UNIQUE_CONSTRAINT) {
		return true;
	}

	return dbError.message?.includes(PENDING_APPROVAL_UNIQUE_CONSTRAINT) ?? false;
}

async function releaseStaleApprovalReservationsForOrganization(
	organizationId: string,
	email: string,
	now: Date,
	dbClient: DbClient = db
): Promise<void> {
	const staleBefore = new Date(now.getTime() - RESERVATION_TIMEOUT_MS);

	const staleReservations = await dbClient
		.select({ id: signupOnboarding.id })
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.organizationId, organizationId),
				eq(signupOnboarding.email, email),
				eq(signupOnboarding.kind, 'approval'),
				eq(signupOnboarding.status, 'reserved'),
				lte(signupOnboarding.updatedAt, staleBefore)
			)
		)
		.orderBy(desc(signupOnboarding.createdAt));

	for (const staleReservation of staleReservations) {
		try {
			await dbClient
				.update(signupOnboarding)
				.set({
					status: 'pending',
					updatedAt: now
				})
				.where(
					and(eq(signupOnboarding.id, staleReservation.id), eq(signupOnboarding.status, 'reserved'))
				)
				.returning({ id: signupOnboarding.id });
		} catch (error) {
			if (!isPendingApprovalUniqueViolation(error)) {
				throw error;
			}

			await dbClient
				.update(signupOnboarding)
				.set({
					status: 'revoked',
					revokedAt: now,
					revokedByUserId: null,
					updatedAt: now
				})
				.where(
					and(eq(signupOnboarding.id, staleReservation.id), eq(signupOnboarding.status, 'reserved'))
				)
				.returning({ id: signupOnboarding.id });
		}
	}
}

export async function reserveOrganizationJoinSignup(
	input: ReserveOrganizationJoinSignupInput,
	dbClient: DbClient = db
): Promise<ReserveOrganizationJoinSignupResult> {
	const now = input.now ?? new Date();
	const normalizedEmail = normalizeEmail(input.email);
	const normalizedOrganizationCode = normalizeOrganizationCode(input.organizationCode);

	if (!normalizedOrganizationCode) {
		return { allowed: false, reason: 'invalid_org_code' };
	}

	const [organization] = await dbClient
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.joinCodeHash, hashOrganizationCode(normalizedOrganizationCode)))
		.limit(1);

	if (!organization) {
		return { allowed: false, reason: 'invalid_org_code' };
	}

	await releaseStaleApprovalReservationsForOrganization(
		organization.id,
		normalizedEmail,
		now,
		dbClient
	);

	const [pendingApproval] = await dbClient
		.select({
			id: signupOnboarding.id,
			targetRole: signupOnboarding.targetRole
		})
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.organizationId, organization.id),
				eq(signupOnboarding.email, normalizedEmail),
				eq(signupOnboarding.kind, 'approval'),
				eq(signupOnboarding.status, 'pending'),
				or(isNull(signupOnboarding.expiresAt), gt(signupOnboarding.expiresAt, now))
			)
		)
		.orderBy(desc(signupOnboarding.createdAt))
		.limit(1);

	if (!pendingApproval) {
		return { allowed: false, reason: 'approval_not_found' };
	}

	const parsedTargetRole = signupOrganizationRoleSchema.safeParse(pendingApproval.targetRole);
	if (!parsedTargetRole.success) {
		return { allowed: false, reason: 'approval_not_found' };
	}

	const [reserved] = await dbClient
		.update(signupOnboarding)
		.set({
			status: 'reserved',
			updatedAt: now
		})
		.where(
			and(
				eq(signupOnboarding.id, pendingApproval.id),
				eq(signupOnboarding.status, 'pending'),
				or(isNull(signupOnboarding.expiresAt), gt(signupOnboarding.expiresAt, now))
			)
		)
		.returning({
			id: signupOnboarding.id,
			organizationId: signupOnboarding.organizationId,
			targetRole: signupOnboarding.targetRole
		});

	if (!reserved?.organizationId) {
		return { allowed: false, reason: 'approval_not_found' };
	}

	return {
		allowed: true,
		reservationId: reserved.id,
		organizationId: reserved.organizationId,
		targetRole: parsedTargetRole.data
	};
}

export async function finalizeOrganizationJoinSignup(
	input: FinalizeOrganizationJoinSignupInput,
	dbClient: DbClient = db
): Promise<FinalizeOrganizationJoinSignupResult | null> {
	const reservationId = normalizeReservationId(input.reservationId);
	if (!reservationId) {
		return null;
	}

	const now = input.now ?? new Date();

	return dbClient.transaction(async (tx) => {
		const [reservation] = await tx
			.select({
				id: signupOnboarding.id,
				organizationId: signupOnboarding.organizationId,
				targetRole: signupOnboarding.targetRole
			})
			.from(signupOnboarding)
			.where(
				and(
					eq(signupOnboarding.id, reservationId),
					eq(signupOnboarding.kind, 'approval'),
					eq(signupOnboarding.status, 'reserved'),
					or(isNull(signupOnboarding.expiresAt), gt(signupOnboarding.expiresAt, now))
				)
			)
			.limit(1);

		if (!reservation?.organizationId) {
			return null;
		}

		const parsedTargetRole = signupOrganizationRoleSchema.safeParse(reservation.targetRole);
		if (!parsedTargetRole.success) {
			return null;
		}

		const [updatedUser] = await tx
			.update(user)
			.set({
				organizationId: reservation.organizationId,
				role: parsedTargetRole.data,
				updatedAt: now
			})
			.where(eq(user.id, input.userId))
			.returning({ id: user.id });

		if (!updatedUser) {
			return null;
		}

		const [consumedReservation] = await tx
			.update(signupOnboarding)
			.set({
				status: 'consumed',
				consumedAt: now,
				consumedByUserId: input.userId,
				updatedAt: now
			})
			.where(and(eq(signupOnboarding.id, reservation.id), eq(signupOnboarding.status, 'reserved')))
			.returning({
				id: signupOnboarding.id,
				organizationId: signupOnboarding.organizationId
			});

		if (!consumedReservation?.organizationId) {
			throw new Error('signup_onboarding_reservation_state_changed');
		}

		return {
			reservationId: consumedReservation.id,
			organizationId: consumedReservation.organizationId,
			targetRole: parsedTargetRole.data
		};
	});
}

export async function finalizeOrganizationCreateSignup(
	input: FinalizeOrganizationCreateSignupInput,
	dbClient: DbClient = db
): Promise<FinalizeOrganizationCreateSignupResult | null> {
	const normalizedOrganizationName = normalizeOrganizationName(input.organizationName);
	if (normalizedOrganizationName.length < 2) {
		return null;
	}

	const now = input.now ?? new Date();
	const slugBase = toOrganizationSlugBase(normalizedOrganizationName);

	for (let attempt = 0; attempt < 6; attempt += 1) {
		const slug =
			attempt === 0
				? slugBase
				: withSlugSuffix(slugBase, randomBytes(ORGANIZATION_SLUG_SUFFIX_BYTES).toString('hex'));
		const organizationJoinCode = generateOrganizationJoinCode();
		const joinCodeHash = hashOrganizationCode(organizationJoinCode);

		try {
			const result = await dbClient.transaction(async (tx) => {
				const [createdOrganization] = await tx
					.insert(organizations)
					.values({
						name: normalizedOrganizationName,
						slug,
						joinCodeHash,
						ownerUserId: input.userId,
						updatedAt: now
					})
					.returning({
						id: organizations.id,
						slug: organizations.slug
					});

				if (!createdOrganization) {
					throw new Error('organization_insert_failed');
				}

				const [updatedUser] = await tx
					.update(user)
					.set({
						organizationId: createdOrganization.id,
						role: 'manager',
						updatedAt: now
					})
					.where(eq(user.id, input.userId))
					.returning({ id: user.id });

				if (!updatedUser) {
					throw new Error('signup_user_not_found');
				}

				await tx
					.insert(organizationDispatchSettings)
					.values({
						organizationId: createdOrganization.id,
						updatedBy: input.userId,
						updatedAt: now
					})
					.onConflictDoNothing();

				return {
					organizationId: createdOrganization.id,
					organizationSlug: createdOrganization.slug,
					organizationJoinCode
				};
			});

			return result;
		} catch (error) {
			if (isOrganizationUniqueViolation(error)) {
				continue;
			}

			throw error;
		}
	}

	throw new Error('organization_create_conflict');
}
