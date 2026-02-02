/**
 * Better Auth Configuration
 */

import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
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

const inviteCodeGuard = createAuthMiddleware(async (ctx) => {
	if (ctx.path !== '/sign-up/email') {
		return;
	}

	const requiredCode = env.BETTER_AUTH_INVITE_CODE?.trim();
	if (!requiredCode) {
		return;
	}

	const headerCode = ctx.headers?.get?.('x-invite-code')?.trim();
	const body = ctx.body as { inviteCode?: string } | undefined;
	const bodyCode = typeof body?.inviteCode === 'string' ? body.inviteCode.trim() : undefined;
	const providedCode = headerCode || bodyCode;

	if (!providedCode || providedCode !== requiredCode) {
		throw new APIError('BAD_REQUEST', { message: 'Invalid invite code' });
	}
});

export const auth = betterAuth({
	appName: 'Drive',
	baseURL: authBaseUrl,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg' }),
	trustedOrigins: ['http://localhost:5173', 'https://*.vercel.app'],
	emailAndPassword: {
		enabled: true
	},
	user: {
		additionalFields: {
			role: {
				type: ['driver', 'manager'],
				required: false,
				defaultValue: 'driver',
				input: false
			}
		}
	},
	hooks: {
		before: inviteCodeGuard
	},
	plugins: [sveltekitCookies(getRequestEvent)]
});
