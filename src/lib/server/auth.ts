/**
 * Better Auth Configuration
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './db';
import { BETTER_AUTH_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';

/**
 * Derive auth base URL:
 * 1. Use BETTER_AUTH_URL if explicitly set (local dev or custom domain)
 * 2. Fall back to Vercel's auto-provided VERCEL_URL for deployments
 */
function getAuthBaseUrl(): string {
	if (env.BETTER_AUTH_URL) {
		return env.BETTER_AUTH_URL;
	}
	if (env.VERCEL_URL) {
		return `https://${env.VERCEL_URL}`;
	}
	throw new Error('BETTER_AUTH_URL or VERCEL_URL must be set');
}

const authBaseUrl = getAuthBaseUrl();

export const auth = betterAuth({
	appName: 'Drive',
	baseURL: authBaseUrl,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	trustedOrigins: ['http://localhost:5173', 'https://*.vercel.app'],
	emailAndPassword: {
		enabled: true
	}
});
