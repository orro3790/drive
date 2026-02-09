import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { signupOnboarding } from '$lib/server/db/schema';

const INVITE_TOKEN_BYTES = 24;

export type SignupOnboardingKind = 'approval' | 'invite';
export type SignupOnboardingStatus = 'pending' | 'consumed' | 'revoked';
export type SignupOnboardingResolvedStatus = SignupOnboardingStatus | 'expired';

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

export interface ResolveProductionSignupAuthorizationInput {
	email: string;
	inviteCodeHeader: string | null;
	now?: Date;
}

export interface ResolveProductionSignupAuthorizationResult {
	allowed: boolean;
	matchedEntryId?: string;
	matchedKind?: SignupOnboardingKind;
}

export interface ConsumeProductionSignupAuthorizationInput {
	email: string;
	userId: string;
	inviteCodeHeader: string | null;
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

async function getPendingEntriesByEmail(
	email: string,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord[]> {
	return dbClient
		.select()
		.from(signupOnboarding)
		.where(and(eq(signupOnboarding.email, email), eq(signupOnboarding.status, 'pending')))
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

async function consumeEntryById(
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
				eq(signupOnboarding.status, 'pending'),
				or(isNull(signupOnboarding.expiresAt), gt(signupOnboarding.expiresAt, now))
			)
		)
		.returning();

	return updated ?? null;
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

export async function resolveProductionSignupAuthorization(
	input: ResolveProductionSignupAuthorizationInput,
	dbClient: DbClient = db
): Promise<ResolveProductionSignupAuthorizationResult> {
	const now = input.now ?? new Date();
	const normalizedEmail = normalizeEmail(input.email);
	const inviteCode = normalizeInviteCode(input.inviteCodeHeader);
	const pendingEntries = await getPendingEntriesByEmail(normalizedEmail, dbClient);

	if (inviteCode) {
		const inviteTokenHash = hashInviteCode(inviteCode);
		const matchingInvite = pendingEntries.find(
			(entry) => entry.kind === 'invite' && entry.tokenHash === inviteTokenHash
		);

		if (matchingInvite && isEntryUsable(matchingInvite, now)) {
			return {
				allowed: true,
				matchedEntryId: matchingInvite.id,
				matchedKind: 'invite'
			};
		}
	}

	const approval = pendingEntries.find((entry) => entry.kind === 'approval');
	if (approval && isEntryUsable(approval, now)) {
		return {
			allowed: true,
			matchedEntryId: approval.id,
			matchedKind: 'approval'
		};
	}

	return { allowed: false };
}

export async function consumeProductionSignupAuthorization(
	input: ConsumeProductionSignupAuthorizationInput,
	dbClient: DbClient = db
): Promise<SignupOnboardingEntryRecord | null> {
	const now = input.now ?? new Date();
	const normalizedEmail = normalizeEmail(input.email);
	const inviteCode = normalizeInviteCode(input.inviteCodeHeader);

	if (inviteCode) {
		const tokenHash = hashInviteCode(inviteCode);
		const invite = await getPendingInviteByHash(normalizedEmail, tokenHash, dbClient);
		if (invite && isEntryUsable(invite, now)) {
			const consumedInvite = await consumeEntryById(invite.id, input.userId, now, dbClient);
			if (consumedInvite) {
				return consumedInvite;
			}
		}
	}

	const approval = await getLatestPendingApproval(normalizedEmail, dbClient);
	if (approval && isEntryUsable(approval, now)) {
		return consumeEntryById(approval.id, input.userId, now, dbClient);
	}

	return null;
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
	const existingApprovals = await dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, normalizedEmail),
				eq(signupOnboarding.kind, 'approval'),
				eq(signupOnboarding.status, 'pending')
			)
		)
		.orderBy(desc(signupOnboarding.createdAt));

	const existing = hasActivePendingEntry(existingApprovals, now);
	if (existing) {
		return {
			entry: toOnboardingEntry(existing, now),
			alreadyExists: true
		};
	}

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
}

export async function createOnboardingInvite(
	input: CreateOnboardingInviteInput,
	dbClient: DbClient = db
): Promise<CreateOnboardingInviteResult> {
	const now = new Date();
	const normalizedEmail = normalizeEmail(input.email);
	const existingInvites = await dbClient
		.select()
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.email, normalizedEmail),
				eq(signupOnboarding.kind, 'invite'),
				eq(signupOnboarding.status, 'pending')
			)
		)
		.orderBy(desc(signupOnboarding.createdAt));

	const existing = hasActivePendingEntry(existingInvites, now);
	if (existing) {
		return {
			entry: toOnboardingEntry(existing, now),
			alreadyExists: true
		};
	}

	const inviteCode = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
	const tokenHash = hashInviteCode(inviteCode);

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
		.where(and(eq(signupOnboarding.id, entryId), eq(signupOnboarding.status, 'pending')))
		.returning();

	if (!updated) {
		return null;
	}

	return toOnboardingEntry(updated, now);
}
