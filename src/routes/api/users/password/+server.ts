/**
 * User Password API
 *
 * POST /api/users/password - Change current user's password
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth-schema';
import { userPasswordUpdateSchema } from '$lib/schemas/user-settings';

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
	return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [salt, key] = stored.split(':');
	if (!salt || !key) return false;
	const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
	const storedBuffer = Buffer.from(key, 'hex');
	if (storedBuffer.length !== derivedKey.length) return false;
	return timingSafeEqual(storedBuffer, derivedKey);
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const body = await request.json();
	const result = userPasswordUpdateSchema.safeParse(body);

	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	const { currentPassword, newPassword } = result.data;

	const [credentialAccount] = await db
		.select({
			id: account.id,
			password: account.password
		})
		.from(account)
		.where(and(eq(account.userId, locals.user.id), eq(account.providerId, 'credential')))
		.limit(1);

	if (!credentialAccount?.password) {
		return json({ error: 'no_credential_account' }, { status: 400 });
	}

	const matches = await verifyPassword(currentPassword, credentialAccount.password);
	if (!matches) {
		return json({ error: 'invalid_password' }, { status: 400 });
	}

	const hashedPassword = await hashPassword(newPassword);
	await db
		.update(account)
		.set({
			password: hashedPassword,
			updatedAt: new Date()
		})
		.where(eq(account.id, credentialAccount.id));

	return json({ success: true });
};
