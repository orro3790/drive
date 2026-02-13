/**
 * Better Auth Configuration
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin as adminPlugin } from 'better-auth/plugins';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import * as authSchema from './db/auth-schema';
import { sendPasswordResetEmail } from './email';
import logger from './logger';
import { BETTER_AUTH_SECRET } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { ac, admin, manager } from './permissions';
import { resolveTrustedOrigins } from './auth-trusted-origins';
import {
	buildAuthRateLimitConfig,
	createSignupAbuseGuard,
	createSignupOrganizationAssignmentDbHook,
	createSignupOnboardingConsumer
} from './auth-abuse-hardening';

/**
 * Derive auth base URL:
 * 1. BETTER_AUTH_URL if explicitly set (local dev: http://localhost:5173)
 * 2. VERCEL_URL — always matches the actual deployment URL the browser
 *    hits, for both production and preview deployments.
 * 3. Fallback: undefined — Better Auth infers from request Host header.
 */
function getAuthBaseUrl(): string | undefined {
	if (env.BETTER_AUTH_URL) {
		return env.BETTER_AUTH_URL;
	}
	if (env.VERCEL_URL) {
		return `https://${env.VERCEL_URL}`;
	}
	if (env.VERCEL_PROJECT_PRODUCTION_URL) {
		return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
	}
	return undefined;
}

const signupAbuseGuard = createSignupAbuseGuard();
const signupOrganizationAssignmentDbHook = createSignupOrganizationAssignmentDbHook();
const signupOnboardingConsumer = createSignupOnboardingConsumer();
const trustedOriginsResolution = resolveTrustedOrigins(env);

if (trustedOriginsResolution.invalidEntries.length > 0) {
	if (trustedOriginsResolution.deploymentEnvironment === 'production') {
		throw new Error(
			`Invalid Better Auth trusted origins: ${trustedOriginsResolution.invalidEntries.join(', ')}`
		);
	}

	logger.warn(
		{ invalidTrustedOrigins: trustedOriginsResolution.invalidEntries },
		'Ignoring invalid Better Auth trusted origins in non-production environment'
	);
}

if (
	trustedOriginsResolution.deploymentEnvironment === 'production' &&
	trustedOriginsResolution.origins.length === 0
) {
	throw new Error('No trusted origins configured for Better Auth in production');
}

export const auth = betterAuth({
	appName: 'Drive',
	baseURL: getAuthBaseUrl(),
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg', schema: authSchema }),
	trustedOrigins: trustedOriginsResolution.origins,
	rateLimit: buildAuthRateLimitConfig(),
	emailAndPassword: {
		enabled: true,
		sendResetPassword: async ({ user, url }) => {
			sendPasswordResetEmail(user.email, url).catch((err) => {
				logger.error(
					{ email: user.email, error: err instanceof Error ? err.message : String(err) },
					'Password reset email failed'
				);
			});
		},
		resetPasswordTokenExpiresIn: 60 * 60
	},
	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: false,
				defaultValue: 'driver',
				input: false
			},
			organizationId: {
				type: 'string',
				required: false,
				defaultValue: null,
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
		before: signupAbuseGuard,
		after: signupOnboardingConsumer
	},
	databaseHooks: {
		user: {
			create: {
				before: signupOrganizationAssignmentDbHook
			}
		}
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
