#!/usr/bin/env tsx
/**
 * Backfill Organizations
 *
 * Idempotent script that ensures all critical tables have a non-null organizationId.
 * Safe to run multiple times — skips rows that already have an org.
 *
 * Usage:
 *   npx tsx scripts/backfill-organizations.ts
 */

import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, isNull, sql } from 'drizzle-orm';
import { config } from 'dotenv';

import { user } from '../src/lib/server/db/auth-schema';
import {
	organizations,
	organizationDispatchSettings,
	warehouses,
	signupOnboarding,
	notifications,
	auditLogs
} from '../src/lib/server/db/schema';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const neonSql = neon(DATABASE_URL);
const db = drizzle(neonSql);

const DEFAULT_ORG_NAME = 'Drive Default Org';
const DEFAULT_ORG_SLUG = 'drive-default-org';

function hashJoinCode(code: string): string {
	return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

async function ensureDefaultOrganization(): Promise<string> {
	// Check if default org already exists
	const [existing] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.slug, DEFAULT_ORG_SLUG))
		.limit(1);

	if (existing) {
		console.log(`  Default org already exists: ${existing.id}`);
		return existing.id;
	}

	// Create default org
	const joinCode = randomBytes(6).toString('hex').toUpperCase();
	const joinCodeHash = hashJoinCode(joinCode);

	const [created] = await db
		.insert(organizations)
		.values({
			name: DEFAULT_ORG_NAME,
			slug: DEFAULT_ORG_SLUG,
			joinCodeHash,
			ownerUserId: null
		})
		.returning({ id: organizations.id });

	if (!created) {
		throw new Error('Failed to create default organization');
	}

	// Create default dispatch settings
	await db
		.insert(organizationDispatchSettings)
		.values({
			organizationId: created.id,
			updatedBy: null
		})
		.onConflictDoNothing();

	console.log(`  Created default org: ${created.id}`);
	console.log(`  Join code: ${joinCode} (save this if needed)`);

	return created.id;
}

async function backfillUsers(defaultOrgId: string): Promise<number> {
	const result = await db
		.update(user)
		.set({ organizationId: defaultOrgId, updatedAt: new Date() })
		.where(isNull(user.organizationId))
		.returning({ id: user.id });

	return result.length;
}

async function backfillWarehouses(defaultOrgId: string): Promise<number> {
	const result = await db
		.update(warehouses)
		.set({ organizationId: defaultOrgId, updatedAt: new Date() })
		.where(isNull(warehouses.organizationId))
		.returning({ id: warehouses.id });

	return result.length;
}

async function backfillSignupOnboarding(defaultOrgId: string): Promise<number> {
	const result = await db
		.update(signupOnboarding)
		.set({ organizationId: defaultOrgId, updatedAt: new Date() })
		.where(isNull(signupOnboarding.organizationId))
		.returning({ id: signupOnboarding.id });

	return result.length;
}

async function backfillNotifications(): Promise<number> {
	// Best-effort: derive org from the notification's user
	const result = await db.execute(sql`
		UPDATE notifications n
		SET organization_id = u.organization_id
		FROM "user" u
		WHERE n.user_id = u.id
		  AND n.organization_id IS NULL
		  AND u.organization_id IS NOT NULL
	`);

	return Number(result.rowCount ?? 0);
}

async function backfillAuditLogs(): Promise<number> {
	// Best-effort: derive org from the audit log's actor
	const result = await db.execute(sql`
		UPDATE audit_logs a
		SET organization_id = u.organization_id
		FROM "user" u
		WHERE a.actor_id = u.id
		  AND a.organization_id IS NULL
		  AND u.organization_id IS NOT NULL
	`);

	return Number(result.rowCount ?? 0);
}

async function main() {
	console.log('\n=== Organization Backfill ===\n');

	console.log('1. Ensuring default organization exists...');
	const defaultOrgId = await ensureDefaultOrganization();

	console.log('\n2. Backfilling users...');
	const usersUpdated = await backfillUsers(defaultOrgId);
	console.log(`   Updated ${usersUpdated} users`);

	console.log('\n3. Backfilling warehouses...');
	const warehousesUpdated = await backfillWarehouses(defaultOrgId);
	console.log(`   Updated ${warehousesUpdated} warehouses`);

	console.log('\n4. Backfilling signup_onboarding...');
	const onboardingUpdated = await backfillSignupOnboarding(defaultOrgId);
	console.log(`   Updated ${onboardingUpdated} onboarding entries`);

	console.log('\n5. Backfilling notifications (best-effort)...');
	const notificationsUpdated = await backfillNotifications();
	console.log(`   Updated ${notificationsUpdated} notifications`);

	console.log('\n6. Backfilling audit_logs (best-effort)...');
	const auditLogsUpdated = await backfillAuditLogs();
	console.log(`   Updated ${auditLogsUpdated} audit logs`);

	console.log('\n=== Summary ===');
	console.log(`  Default org: ${defaultOrgId}`);
	console.log(`  Users:              ${usersUpdated}`);
	console.log(`  Warehouses:         ${warehousesUpdated}`);
	console.log(`  Signup onboarding:  ${onboardingUpdated}`);
	console.log(`  Notifications:      ${notificationsUpdated}`);
	console.log(`  Audit logs:         ${auditLogsUpdated}`);
	console.log('\nBackfill complete.');
}

main().catch((err) => {
	console.error('Backfill failed:', err);
	process.exit(1);
});
