#!/usr/bin/env tsx

import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';

import { user } from '../src/lib/server/db/auth-schema';
import { organizations, signupOnboarding, warehouses } from '../src/lib/server/db/schema';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient);

const DEFAULT_RESERVATION_STALE_MINUTES = 10;
const DEFAULT_ORGANIZATION_STALE_MINUTES = 30;
const DEFAULT_LIMIT = 200;
const PENDING_APPROVAL_UNIQUE_CONSTRAINT = 'uq_signup_onboarding_pending_org_email_kind_role';

function parseNumberArg(name: string, fallback: number): number {
	const arg = process.argv.find((value) => value.startsWith(`${name}=`));
	if (!arg) {
		return fallback;
	}

	const parsed = Number(arg.split('=')[1]);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`Invalid numeric value for ${name}`);
	}

	return parsed;
}

function toIso(timestamp: Date | null | undefined): string {
	if (!timestamp) {
		return 'n/a';
	}

	return timestamp.toISOString();
}

function toEmailDomain(email: string): string {
	const atIndex = email.indexOf('@');
	if (atIndex < 0 || atIndex === email.length - 1) {
		return 'invalid';
	}

	return email.slice(atIndex + 1).toLowerCase();
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

async function main() {
	const apply = process.argv.includes('--apply');
	const reservationStaleMinutes = parseNumberArg(
		'--reservation-minutes',
		DEFAULT_RESERVATION_STALE_MINUTES
	);
	const organizationStaleMinutes = parseNumberArg(
		'--organization-minutes',
		DEFAULT_ORGANIZATION_STALE_MINUTES
	);
	const limit = parseNumberArg('--limit', DEFAULT_LIMIT);

	const now = new Date();
	const reservationStaleBefore = new Date(now.getTime() - reservationStaleMinutes * 60 * 1000);
	const organizationStaleBefore = new Date(now.getTime() - organizationStaleMinutes * 60 * 1000);

	console.log(`\n=== Signup Org Finalization Reconciliation (${apply ? 'APPLY' : 'DRY RUN'}) ===`);
	console.log(`Now: ${toIso(now)}`);
	console.log(
		`Reservation threshold: ${reservationStaleMinutes}m (<= ${toIso(reservationStaleBefore)})`
	);
	console.log(
		`Organization threshold: ${organizationStaleMinutes}m (<= ${toIso(organizationStaleBefore)})`
	);
	console.log(`Batch limit: ${limit}`);

	const staleReservations = await db
		.select({
			id: signupOnboarding.id,
			organizationId: signupOnboarding.organizationId,
			email: signupOnboarding.email,
			updatedAt: signupOnboarding.updatedAt
		})
		.from(signupOnboarding)
		.where(
			and(
				eq(signupOnboarding.kind, 'approval'),
				eq(signupOnboarding.status, 'reserved'),
				lte(signupOnboarding.updatedAt, reservationStaleBefore)
			)
		)
		.orderBy(desc(signupOnboarding.updatedAt))
		.limit(limit);

	const staleOrganizations = await db
		.select({
			id: organizations.id,
			updatedAt: organizations.updatedAt
		})
		.from(organizations)
		.where(
			and(isNull(organizations.ownerUserId), lte(organizations.updatedAt, organizationStaleBefore))
		)
		.orderBy(desc(organizations.updatedAt))
		.limit(limit);

	console.log(`\nStale reserved approvals: ${staleReservations.length}`);
	for (const reservation of staleReservations.slice(0, 20)) {
		console.log(
			`  - reservation=${reservation.id} org=${reservation.organizationId} emailDomain=${toEmailDomain(reservation.email)} updated=${toIso(reservation.updatedAt)}`
		);
	}

	console.log(`\nStale unowned organizations (pre-filter): ${staleOrganizations.length}`);
	for (const organization of staleOrganizations.slice(0, 20)) {
		console.log(`  - organization=${organization.id} updated=${toIso(organization.updatedAt)}`);
	}

	if (!apply) {
		console.log('\nDry run complete. Re-run with --apply to execute remediation.');
		return;
	}

	let releasedReservations = 0;
	let revokedReservations = 0;
	for (const reservation of staleReservations) {
		try {
			const [released] = await db
				.update(signupOnboarding)
				.set({ status: 'pending', updatedAt: now })
				.where(
					and(eq(signupOnboarding.id, reservation.id), eq(signupOnboarding.status, 'reserved'))
				)
				.returning({ id: signupOnboarding.id });

			if (released) {
				releasedReservations += 1;
			}

			continue;
		} catch (error) {
			if (!isPendingApprovalUniqueViolation(error)) {
				throw error;
			}
		}

		const [revoked] = await db
			.update(signupOnboarding)
			.set({
				status: 'revoked',
				revokedAt: now,
				revokedByUserId: null,
				updatedAt: now
			})
			.where(and(eq(signupOnboarding.id, reservation.id), eq(signupOnboarding.status, 'reserved')))
			.returning({ id: signupOnboarding.id });

		if (revoked) {
			revokedReservations += 1;
		}
	}

	let deletedOrganizations = 0;
	for (const organization of staleOrganizations) {
		const [deleted] = await db
			.delete(organizations)
			.where(
				and(
					eq(organizations.id, organization.id),
					isNull(organizations.ownerUserId),
					sql`not exists (
						select 1 from "user" as u
						where u.organization_id = ${organizations.id}
					)`,
					sql`not exists (
						select 1 from "warehouses" as w
						where w.organization_id = ${organizations.id}
					)`,
					sql`not exists (
						select 1 from "signup_onboarding" as so
						where so.organization_id = ${organizations.id}
					)`
				)
			)
			.returning({ id: organizations.id });

		if (deleted) {
			deletedOrganizations += 1;
		}
	}

	const remainingNullUsers = await db
		.select({
			nullUserCount: sql<number>`count(*)`
		})
		.from(user)
		.where(isNull(user.organizationId));

	console.log('\n=== Reconciliation Result ===');
	console.log(`Released reservations: ${releasedReservations}/${staleReservations.length}`);
	console.log(`Revoked reservations: ${revokedReservations}/${staleReservations.length}`);
	console.log(`Deleted organizations: ${deletedOrganizations}/${staleOrganizations.length}`);
	console.log(`Remaining null-user count: ${remainingNullUsers[0]?.nullUserCount ?? 0}`);
}

main().catch((error) => {
	console.error('Signup reconciliation failed:', error);
	process.exit(1);
});
