#!/usr/bin/env tsx
/**
 * Validate Organization Migration
 *
 * Pre-flight check before applying NOT NULL constraints.
 * Verifies zero null organizationId values on critical tables.
 *
 * Usage:
 *   npx tsx scripts/validate-org-migration.ts
 *
 * Exits 0 if all checks pass, 1 if any check fails.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { isNull, sql } from 'drizzle-orm';
import { config } from 'dotenv';

import { user } from '../src/lib/server/db/auth-schema';
import { warehouses, signupOnboarding, organizations } from '../src/lib/server/db/schema';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const neonSql = neon(DATABASE_URL);
const db = drizzle(neonSql);

interface CheckResult {
	name: string;
	passed: boolean;
	detail: string;
}

async function checkNullUsers(): Promise<CheckResult> {
	// user.organizationId stays nullable because Better Auth's signup flow
	// creates the user with null org before the after-hook sets it.
	// This check is advisory — it should be zero after backfill, but is not a blocker.
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(user)
		.where(isNull(user.organizationId));

	const count = Number(result.count);
	return {
		name: 'Users with null organizationId (advisory)',
		passed: true, // Not a blocker — user table stays nullable
		detail:
			count === 0
				? 'OK — zero null rows'
				: `INFO — ${count} users have null organizationId (expected during active signups)`
	};
}

async function checkNullWarehouses(): Promise<CheckResult> {
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(warehouses)
		.where(isNull(warehouses.organizationId));

	const count = Number(result.count);
	return {
		name: 'Warehouses with null organizationId',
		passed: count === 0,
		detail:
			count === 0
				? 'OK — zero null rows'
				: `FAIL — ${count} warehouses have null organizationId`
	};
}

async function checkNullSignupOnboarding(): Promise<CheckResult> {
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(signupOnboarding)
		.where(isNull(signupOnboarding.organizationId));

	const count = Number(result.count);
	return {
		name: 'Signup onboarding with null organizationId',
		passed: count === 0,
		detail:
			count === 0
				? 'OK — zero null rows'
				: `FAIL — ${count} onboarding entries have null organizationId`
	};
}

async function checkOrganizationsExist(): Promise<CheckResult> {
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(organizations);

	const count = Number(result.count);
	return {
		name: 'Organizations table has records',
		passed: count > 0,
		detail:
			count > 0
				? `OK — ${count} organization(s) exist`
				: 'FAIL — no organizations found (backfill not run?)'
	};
}

async function checkFkIntegrityUsers(): Promise<CheckResult> {
	const [result] = await db.execute(sql`
		SELECT count(*) AS count
		FROM "user" u
		LEFT JOIN organizations o ON u.organization_id = o.id
		WHERE u.organization_id IS NOT NULL
		  AND o.id IS NULL
	`);

	const count = Number((result as { count: number }).count);
	return {
		name: 'FK integrity (user → organizations)',
		passed: count === 0,
		detail:
			count === 0
				? 'OK — all referenced orgs exist'
				: `FAIL — ${count} users reference non-existent organizations`
	};
}

async function checkFkIntegrityWarehouses(): Promise<CheckResult> {
	const [result] = await db.execute(sql`
		SELECT count(*) AS count
		FROM warehouses w
		LEFT JOIN organizations o ON w.organization_id = o.id
		WHERE w.organization_id IS NOT NULL
		  AND o.id IS NULL
	`);

	const count = Number((result as { count: number }).count);
	return {
		name: 'FK integrity (warehouses → organizations)',
		passed: count === 0,
		detail:
			count === 0
				? 'OK — all referenced orgs exist'
				: `FAIL — ${count} warehouses reference non-existent organizations`
	};
}

async function checkFkIntegritySignupOnboarding(): Promise<CheckResult> {
	const [result] = await db.execute(sql`
		SELECT count(*) AS count
		FROM signup_onboarding s
		LEFT JOIN organizations o ON s.organization_id = o.id
		WHERE s.organization_id IS NOT NULL
		  AND o.id IS NULL
	`);

	const count = Number((result as { count: number }).count);
	return {
		name: 'FK integrity (signup_onboarding → organizations)',
		passed: count === 0,
		detail:
			count === 0
				? 'OK — all referenced orgs exist'
				: `FAIL — ${count} onboarding entries reference non-existent organizations`
	};
}

async function main() {
	console.log('\n=== Organization Migration Validation ===\n');

	const checks = await Promise.all([
		checkNullUsers(),
		checkNullWarehouses(),
		checkNullSignupOnboarding(),
		checkOrganizationsExist(),
		checkFkIntegrityUsers(),
		checkFkIntegrityWarehouses(),
		checkFkIntegritySignupOnboarding()
	]);

	let allPassed = true;
	for (const check of checks) {
		const icon = check.passed ? '✓' : '✗';
		console.log(`  ${icon} ${check.name}: ${check.detail}`);
		if (!check.passed) allPassed = false;
	}

	console.log('');
	if (allPassed) {
		console.log('All checks passed. Safe to apply NOT NULL migration.');
		process.exit(0);
	} else {
		console.log('VALIDATION FAILED. Do NOT apply NOT NULL migration until all checks pass.');
		console.log('Run scripts/backfill-organizations.ts first.');
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('Validation failed:', err);
	process.exit(1);
});
