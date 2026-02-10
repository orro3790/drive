/**
 * Verify password for a specific user
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and } from 'drizzle-orm';
import { scrypt } from 'crypto';
import { promisify } from 'util';
import { config } from 'dotenv';
import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	role: text('role').notNull().default('driver')
});

const account = pgTable('account', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull(),
	providerId: text('provider_id').notNull(),
	password: text('password')
});

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

const scryptAsync = promisify(scrypt);

async function verifyPassword(password: string, hash: string): Promise<boolean> {
	const [salt, key] = hash.split(':');
	if (!salt || !key) return false;
	const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
	return derivedKey.toString('hex') === key;
}

async function main() {
	const EMAIL = 'justin.myddp@proton.me';
	const PASSWORD = 'test1234';

	// Find user
	const [targetUser] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);
	if (!targetUser) {
		console.error('User not found');
		process.exit(1);
	}

	console.log('User:', targetUser);

	// Find account
	const [acc] = await db
		.select()
		.from(account)
		.where(and(eq(account.userId, targetUser.id), eq(account.providerId, 'credential')))
		.limit(1);

	if (!acc) {
		console.error('Account not found');
		process.exit(1);
	}

	console.log('Account ID:', acc.id);
	console.log('Password hash:', acc.password);
	console.log('Password hash length:', acc.password?.length);

	if (acc.password) {
		const isValid = await verifyPassword(PASSWORD, acc.password);
		console.log(`\nPassword "${PASSWORD}" is valid:`, isValid);
	}
}

main().catch(console.error);
