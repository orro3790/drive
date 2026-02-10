/**
 * Reset manager password using Better Auth's exact hashing method.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, and } from 'drizzle-orm';
// Use the @noble/hashes package (dev dependency matching Better Auth's internal usage)
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';
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
	role: text('role').notNull().default('driver'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

const account = pgTable('account', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull(),
	providerId: text('provider_id').notNull(),
	password: text('password'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

// Match Better Auth's exact config
const scryptConfig = {
	N: 16384,
	r: 16,
	p: 1,
	dkLen: 64
};

async function hashPassword(password: string): Promise<string> {
	const salt = bytesToHex(randomBytes(16));
	const key = await scryptAsync(password.normalize('NFKC'), salt, {
		N: scryptConfig.N,
		r: scryptConfig.r,
		p: scryptConfig.p,
		dkLen: scryptConfig.dkLen,
		maxmem: 128 * scryptConfig.N * scryptConfig.r * 2
	});
	return `${salt}:${bytesToHex(key)}`;
}

async function main() {
	const EMAIL = 'justin.myddp@proton.me';
	const NEW_PASSWORD = 'test1234';

	console.log(`Resetting password for: ${EMAIL}`);

	// Find user
	const [targetUser] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);

	if (!targetUser) {
		console.error('User not found!');
		process.exit(1);
	}

	console.log(`Found user: ${targetUser.name} (${targetUser.id}), role: ${targetUser.role}`);

	// Ensure role is manager
	if (targetUser.role !== 'manager') {
		await db
			.update(user)
			.set({ role: 'manager', updatedAt: new Date() })
			.where(eq(user.id, targetUser.id));
		console.log('Updated role to: manager');
	}

	// Find credential account
	const [credentialAccount] = await db
		.select()
		.from(account)
		.where(and(eq(account.userId, targetUser.id), eq(account.providerId, 'credential')))
		.limit(1);

	if (!credentialAccount) {
		console.error('No credential account found!');
		process.exit(1);
	}

	// Hash and update password
	const hashedPassword = await hashPassword(NEW_PASSWORD);
	console.log('New hash:', hashedPassword.substring(0, 50) + '...');

	await db
		.update(account)
		.set({ password: hashedPassword, updatedAt: new Date() })
		.where(eq(account.id, credentialAccount.id));

	console.log('Password updated successfully!');
	console.log(`\nManager account ready:\n  Email: ${EMAIL}\n  Password: ${NEW_PASSWORD}`);
}

main().catch(console.error);
