import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { signupOnboarding } from '$lib/server/db/schema';
import {
	signupOnboardingReservationIdSchema,
	type SignupOnboardingKind,
	type SignupOnboardingStatus
} from '$lib/schemas/onboarding';

const INVITE_TOKEN_BYTES = 24;
const RESERVATION_TIMEOUT_MS = 10 * 60 * 1000;
const PENDING_EMAIL_KIND_UNIQUE_CONSTRAINT = 'uq_signup_onboarding_pending_email_kind';

export type SignupOnboardingResolvedStatus = SignupOnboardingStatus | 'expired';
export type { SignupOnboardingKind, SignupOnboardingStatus };

type DbClient = Pick<typeof db, 'select' | 'insert' | 'update'>;

export interface SignupOnboardingEntryRecord {
	id: string;
	email: string;
	kind: SignupOnboardingKind;
	tokenHash: string | null;
	status: SignupOnboardingStatus;
	createdBy: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	consumedAt: Date | null;
	consumedByUserId: string | null;
	revokedAt: Date | null;
	revokedByUserId: string | null;
	updatedAt: Date;
}

export interface SignupOnboardingEntry {
	id: string;
	email: string;
	kind: SignupOnboardingKind;
	status: SignupOnboardingStatus;
	resolvedStatus: SignupOnboardingResolvedStatus;
	createdBy: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	consumedAt: Date | null;
	consumedByUserId: string | null;
	revokedAt: Date | null;
	revokedByUserId: string | null;
	updatedAt: Date;
}

export interface ReserveProductionSignupAuthorizationInput {
	email: string;
	inviteCodeHeader: string | null;
	now?: Date;
}

export type ReserveProductionSignupAuthorizationResult =
	| {
			allowed: true;
			reservationId: string;
			matchedEntryId: string;
			matchedKind: SignupOnboardingKind;
	  }
	| {
			allowed: false;
	  };

export interface FinalizeProductionSignupAuthorizationReservationInput {
	reservationId: string;
	userId: string;
	now?: Date;
}

export interface ReleaseProductionSignupAuthorizationReservationInput {
	reservationId: string;
	now?: Date;
}

export interface CreateOnboardingApprovalInput {
	email: string;
	createdBy: string;
	expiresAt?: Date | null;
}

export interface CreateOnboardingInviteInput {
	email: string;
	createdBy: string;
	expiresAt: Date;
}

export interface CreateOnboardingResult {
	entry: SignupOnboardingEntry;
	alreadyExists: boolean;
}

export interface CreateOnboardingInviteResult extends CreateOnboardingResult {
	inviteCode?: string;
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function normalizeInviteCode(inviteCode: string | null | undefined): string | null {
	if (!inviteCode) {
		return null;
	}

	const normalized = inviteCode.trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeReservationId(reservationId: string): string | null {
	const normalized = reservationId.trim();
	const parsed = signupOnboardingReservationIdSchema.safeParse(normalized);
	return parsed.success ? parsed.data : null;
}

export function hashInviteCode(inviteCode: string): string {
	return createHash('sha256').update(inviteCode).digest('hex');
}

export function resolveOnboardingStatus(
	entry: Pick<SignupOnboardingEntryRecord, 'status' | 'expiresAt'>,
	now = new Date()
): SignupOnboardingResolvedStatus {
	if (entry.status === 'pending' && entry.expiresAt && entry.expiresAt.getTime() <= now.getTime()) {
		return 'expired';
	}

	return entry.status;
}

function isEntryUsable(
	entry: Pick<SignupOnboardingEntryRecord, 'status' | 'expiresAt'>,
	now = new Date()
): boolean {
	return resolveOnboardingStatus(entry, now) === 'pending';
}

function toOnboardingEntry(
	entry: SignupOnboardingEntryRecord,
	now = new Date()
): SignupOnboardingEntry {
	return {
		id: entry.id,
		email: entry.email,
		kind: entry.kind,
		status: entry.status,
		resolvedStatus: resolveOnboardingStatus(entry, now),
		createdBy: entry.createdBy,
		createdAt: entry.createdAt,
		expiresAt: entry.expiresAt,
		consumedAt: entry.consumedAt,
		consumedByUserId: entry.consumedByUserId,
		revokedAt: entry.revokedAt,
		revokedByUserId: entry.revokedByUserId,
		updatedAt: entry.updatedAt
	};
}

async function getPendingEntriesByEmailAndKind(
	email: string,
	kind: SignupOnboardingKind,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord[]> {
	return dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, email),
				eq(signupOnboarding.kind, kind),
				eq(signupOnboarding.status, 'pending')
			)
		)
		.orderBy(desc(signupOnboarding.createdAt));
}

async function getReservedEntriesByEmailAndKind(
	email: string,
	kind: SignupOnboardingKind,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord[]> {
	return dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, email),
				eq(signupOnboarding.kind, kind),
				eq(signupOnboarding.status, 'reserved')
			)
		)
		.orderBy(desc(signupOnboarding.createdAt));
}

async function getPendingInviteByHash(
	email: string,
	tokenHash: string,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const [invite] = await dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, email),
				eq(signupOnboarding.kind, 'invite'),
				eq(signupOnboarding.tokenHash, tokenHash),
				eq(signupOnboarding.status, 'pending')
			)
		)
		.orderBy(desc(signupOnboarding.createdAt))
		.limit(1);

	return invite ?? null;
}

async function getLatestPendingApproval(
	email: string,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const [approval] = await dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, email),
				eq(signupOnboarding.kind, 'approval'),
				eq(signupOnboarding.status, 'pending')
			)
		)
		.orderBy(desc(signupOnboarding.createdAt))
		.limit(1);

	return approval ?? null;
}

async function reserveEntryById(
	entryId: string,
	now: Date,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const [updated] = await dbClient
		.update(signupOnboarding)
		.set({
			status: 'reserved',
			updatedAt: now
		})
		.where(
			and(
				eq(signupOnboarding.id, entryId),
				eq(signupOnboarding.status, 'pending'),
				or(isNull(signupOnboarding.expiresAt), gt(signupOnboarding.expiresAt, now))
			)
		)
		.returning();

	return updated ?? null;
}

async function consumeReservedEntryById(
	entryId: string,
	userId: string,
	now: Date,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const [updated] = await dbClient
		.update(signupOnboarding)
		.set({
			status: 'consumed',
			consumedAt: now,
			consumedByUserId: userId,
			updatedAt: now
		})
		.where(
			and(
				eq(signupOnboarding.id, entryId),
				eq(signupOnboarding.status, 'reserved'),
				or(isNull(signupOnboarding.expiresAt), gt(signupOnboarding.expiresAt, now))
			)
		)
		.returning();

	return updated ?? null;
}

async function releaseReservationById(
	entryId: string,
	now: Date,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const [updated] = await dbClient
		.update(signupOnboarding)
		.set({
			status: 'pending',
			updatedAt: now
		})
		.where(and(eq(signupOnboarding.id, entryId), eq(signupOnboarding.status, 'reserved')))
		.returning();

	return updated ?? null;
}

async function releaseStaleReservationsForEmail(
	email: string,
	now: Date,
	dbClient: DbClient = db
): Promise<void> {
	const staleBefore = new Date(now.getTime() - RESERVATION_TIMEOUT_MS);
	const staleReservations = await dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, email),
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
				.returning();
		} catch (error) {
			if (!isPendingEmailKindUniqueViolation(error)) {
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
				.returning();
		}
	}
}

async function revokeExpiredPendingEntriesByKind(
	email: string,
	kind: SignupOnboardingKind,
	now: Date,
	dbClient: DbClient = db
): Promise<void> {
	await dbClient
		.update(signupOnboarding)
		.set({
			status: 'revoked',
			revokedAt: now,
			revokedByUserId: null,
			updatedAt: now
		})
		.where(
			and(
				eq(signupOnboarding.email, email),
				eq(signupOnboarding.kind, kind),
				eq(signupOnboarding.status, 'pending'),
				lte(signupOnboarding.expiresAt, now)
			)
		)
		.returning();
}

function hasActivePendingEntry(
	entries: SignupOnboardingEntryRecord[],
	now = new Date()
): SignupOnboardingEntryRecord | null {
	for (const entry of entries) {
		if (isEntryUsable(entry, now)) {
			return entry;
		}
	}

	return null;
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

function isPendingEmailKindUniqueViolation(error: unknown): boolean {
	const dbError = extractDatabaseError(error);

	if (dbError.code !== '23505') {
		return false;
	}

	if (dbError.constraint === PENDING_EMAIL_KIND_UNIQUE_CONSTRAINT) {
		return true;
	}

	return dbError.message?.includes(PENDING_EMAIL_KIND_UNIQUE_CONSTRAINT) ?? false;
}

export async function reserveProductionSignupAuthorization(
	input: ReserveProductionSignupAuthorizationInput,
	dbClient: DbClient = db
): Promise<ReserveProductionSignupAuthorizationResult> {
	const now = input.now ?? new Date();
	const normalizedEmail = normalizeEmail(input.email);
	const inviteCode = normalizeInviteCode(input.inviteCodeHeader);

	await releaseStaleReservationsForEmail(normalizedEmail, now, dbClient);

	if (inviteCode) {
		const tokenHash = hashInviteCode(inviteCode);
		const invite = await getPendingInviteByHash(normalizedEmail, tokenHash, dbClient);

		if (invite && isEntryUsable(invite, now)) {
			const reservation = await reserveEntryById(invite.id, now, dbClient);
			if (reservation) {
				return {
					allowed: true,
					reservationId: reservation.id,
					matchedEntryId: reservation.id,
					matchedKind: 'invite'
				};
			}
		}
	}

	const approval = await getLatestPendingApproval(normalizedEmail, dbClient);
	if (approval && isEntryUsable(approval, now)) {
		const reservation = await reserveEntryById(approval.id, now, dbClient);
		if (reservation) {
			return {
				allowed: true,
				reservationId: reservation.id,
				matchedEntryId: reservation.id,
				matchedKind: 'approval'
			};
		}
	}

	return { allowed: false };
}

export async function finalizeProductionSignupAuthorizationReservation(
	input: FinalizeProductionSignupAuthorizationReservationInput,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const reservationId = normalizeReservationId(input.reservationId);
	if (!reservationId) {
		return null;
	}

	const now = input.now ?? new Date();
	return consumeReservedEntryById(reservationId, input.userId, now, dbClient);
}

export async function releaseProductionSignupAuthorizationReservation(
	input: ReleaseProductionSignupAuthorizationReservationInput,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const reservationId = normalizeReservationId(input.reservationId);
	if (!reservationId) {
		return null;
	}

	const now = input.now ?? new Date();
	return releaseReservationById(reservationId, now, dbClient);
}

export async function listSignupOnboardingEntries(
	limit = 200,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntry[]> {
	const now = new Date();
	const entries = await dbClient
		.select()
		.from(signupOnboarding)
		.orderBy(desc(signupOnboarding.createdAt))
		.limit(limit);

	return entries.map((entry) => toOnboardingEntry(entry, now));
}

export async function createOnboardingApproval(
	input: CreateOnboardingApprovalInput,
	dbClient: DbClient = db
): Promise<CreateOnboardingResult> {
	const now = new Date();
	const normalizedEmail = normalizeEmail(input.email);

	await revokeExpiredPendingEntriesByKind(normalizedEmail, 'approval', now, dbClient);

	const existingApprovals = await getPendingEntriesByEmailAndKind(
		normalizedEmail,
		'approval',
		dbClient
	);
	const existing = hasActivePendingEntry(existingApprovals, now);
	if (existing) {
		return {
			entry: toOnboardingEntry(existing, now),
			alreadyExists: true
		};
	}

	const existingReservedApprovals = await getReservedEntriesByEmailAndKind(
		normalizedEmail,
		'approval',
		dbClient
	);
	const existingReservedApproval = existingReservedApprovals[0] ?? null;
	if (existingReservedApproval) {
		return {
			entry: toOnboardingEntry(existingReservedApproval, now),
			alreadyExists: true
		};
	}

	try {
		const [created] = await dbClient
			.insert(signupOnboarding)
			.values({
				email: normalizedEmail,
				kind: 'approval',
				status: 'pending',
				createdBy: input.createdBy,
				expiresAt: input.expiresAt ?? null,
				updatedAt: now
			})
			.returning();

		return {
			entry: toOnboardingEntry(created, now),
			alreadyExists: false
		};
	} catch (error) {
		if (isPendingEmailKindUniqueViolation(error)) {
			const racedApprovals = await getPendingEntriesByEmailAndKind(
				normalizedEmail,
				'approval',
				dbClient
			);
			const racedEntry = hasActivePendingEntry(racedApprovals, now);

			if (racedEntry) {
				return {
					entry: toOnboardingEntry(racedEntry, now),
					alreadyExists: true
				};
			}

			const racedReservedApprovals = await getReservedEntriesByEmailAndKind(
				normalizedEmail,
				'approval',
				dbClient
			);
			const racedReserved = racedReservedApprovals[0] ?? null;

			if (racedReserved) {
				return {
					entry: toOnboardingEntry(racedReserved, now),
					alreadyExists: true
				};
			}
		}

		throw error;
	}
}

export async function createOnboardingInvite(
	input: CreateOnboardingInviteInput,
	dbClient: DbClient = db
): Promise<CreateOnboardingInviteResult> {
	const now = new Date();
	const normalizedEmail = normalizeEmail(input.email);

	await revokeExpiredPendingEntriesByKind(normalizedEmail, 'invite', now, dbClient);

	const existingInvites = await getPendingEntriesByEmailAndKind(
		normalizedEmail,
		'invite',
		dbClient
	);
	const existing = hasActivePendingEntry(existingInvites, now);
	if (existing) {
		return {
			entry: toOnboardingEntry(existing, now),
			alreadyExists: true
		};
	}

	const existingReservedInvites = await getReservedEntriesByEmailAndKind(
		normalizedEmail,
		'invite',
		dbClient
	);
	const existingReservedInvite = existingReservedInvites[0] ?? null;
	if (existingReservedInvite) {
		return {
			entry: toOnboardingEntry(existingReservedInvite, now),
			alreadyExists: true
		};
	}

	const inviteCode = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
	const tokenHash = hashInviteCode(inviteCode);

	try {
		const [created] = await dbClient
			.insert(signupOnboarding)
			.values({
				email: normalizedEmail,
				kind: 'invite',
				tokenHash,
				status: 'pending',
				createdBy: input.createdBy,
				expiresAt: input.expiresAt,
				updatedAt: now
			})
			.returning();

		return {
			entry: toOnboardingEntry(created, now),
			inviteCode,
			alreadyExists: false
		};
	} catch (error) {
		if (isPendingEmailKindUniqueViolation(error)) {
			const racedInvites = await getPendingEntriesByEmailAndKind(
				normalizedEmail,
				'invite',
				dbClient
			);
			const racedEntry = hasActivePendingEntry(racedInvites, now);

			if (racedEntry) {
				return {
					entry: toOnboardingEntry(racedEntry, now),
					alreadyExists: true
				};
			}

			const racedReservedInvites = await getReservedEntriesByEmailAndKind(
				normalizedEmail,
				'invite',
				dbClient
			);
			const racedReserved = racedReservedInvites[0] ?? null;

			if (racedReserved) {
				return {
					entry: toOnboardingEntry(racedReserved, now),
					alreadyExists: true
				};
			}
		}

		throw error;
	}
}

export async function revokeOnboardingEntry(
	entryId: string,
	revokedByUserId: string,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntry | null> {
	const now = new Date();
	const [updated] = await dbClient
		.update(signupOnboarding)
		.set({
			status: 'revoked',
			revokedAt: now,
			revokedByUserId,
			updatedAt: now
		})
		.where(
			and(
				eq(signupOnboarding.id, entryId),
				or(eq(signupOnboarding.status, 'pending'), eq(signupOnboarding.status, 'reserved'))
			)
		)
		.returning();

	if (!updated) {
		return null;
	}

	return toOnboardingEntry(updated, now);
}
