/**
 * Better Auth Configuration
 */

import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin as adminPlugin } from 'better-auth/plugins';
import { getRequestEvent } from '$app/server';
import { db } from './db';
import * as authSchema from './db/auth-schema';
import { sendPasswordResetEmail } from './email';
import logger from './logger';
import { BETTER_AUTH_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { ac, admin, manager } from './permissions';

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

	// Check header only - the client sends invite code via x-invite-code header
	const providedCode = ctx.headers?.get?.('x-invite-code')?.trim();

	if (!providedCode || providedCode !== requiredCode) {
		throw new APIError('BAD_REQUEST', { message: 'Invalid invite code' });
	}
});

export const auth = betterAuth({
	appName: 'Drive',
	baseURL: authBaseUrl,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
	trustedOrigins: ['http://localhost:5173', 'https://*.vercel.app'],
	emailAndPassword: {
		enabled: true
		// NOTE: Email-based password reset is disabled until a domain is configured in Resend.
		// When ready to enable:
		// 1. Add verified domain in Resend dashboard
		// 2. Set RESEND_API_KEY and EMAIL_FROM in Vercel env vars
		// 3. Uncomment the sendResetPassword hook below
		//
		// sendResetPassword: async ({ user, url }) => {
		// 	sendPasswordResetEmail(user.email, url).catch((err) => {
		// 		logger.error({ email: user.email, error: err.message }, 'Password reset email failed');
		// 	});
		// },
		// resetPasswordTokenExpiresIn: 60 * 60 // 1 hour in seconds
	},
	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: false,
				defaultValue: 'driver',
				input: false
			},
			phone: {
				type: 'string',
				required: false,
				defaultValue: null,
				input: true
			},
			weeklyCap: {
				type: 'number',
				required: false,
				defaultValue: 4,
				input: false
			},
			isFlagged: {
				type: 'boolean',
				required: false,
				defaultValue: false,
				input: false
			},
			flagWarningDate: {
				type: 'date',
				required: false,
				defaultValue: null,
				input: false
			}
		}
	},
	hooks: {
		before: inviteCodeGuard
	},
	plugins: [
		sveltekitCookies(getRequestEvent),
		adminPlugin({
			ac,
			roles: {
				admin,
				manager
			}
		})
	]
});
