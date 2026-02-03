/**
 * Check the password hash format in the database
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and } from 'drizzle-orm';
import { config } from 'dotenv';
import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const account = pgTable('account', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	password: text('password'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

async function main() {
	// Get all credential accounts
	const accounts = await db.select().from(account).where(eq(account.providerId, 'credential'));

	console.log('Password hash formats in database:');
	for (const acc of accounts) {
		console.log(`\nAccount ID: ${acc.id}`);
		console.log(`Password (first 100 chars): ${acc.password?.substring(0, 100)}...`);
		console.log(`Password length: ${acc.password?.length}`);
	}
}

main().catch(console.error);
