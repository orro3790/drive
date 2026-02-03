/**
 * Password Hashing Utility
 *
 * Uses the same scrypt configuration as Better Auth to ensure
 * seeded users can log in.
 */

import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, randomBytes } from '@noble/hashes/utils.js';

const SCRYPT_CONFIG = {
	N: 16384,
	r: 16,
	p: 1,
	dkLen: 64
};

export async function hashPassword(password: string): Promise<string> {
	const salt = bytesToHex(randomBytes(16));
	const key = await scryptAsync(password.normalize('NFKC'), salt, {
		N: SCRYPT_CONFIG.N,
		r: SCRYPT_CONFIG.r,
		p: SCRYPT_CONFIG.p,
		dkLen: SCRYPT_CONFIG.dkLen,
		maxmem: 128 * SCRYPT_CONFIG.N * SCRYPT_CONFIG.r * 2
	});
	return `${salt}:${bytesToHex(key)}`;
}
