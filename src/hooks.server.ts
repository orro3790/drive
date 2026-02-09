/**
 * Server Hooks - Auth Middleware
 */

import type { Handle } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import logger from '$lib/server/logger';

const publicPaths = new Set(['/', '/sign-in', '/sign-up']);
const publicPrefixes = ['/api/auth', '/api/cron', '/_app', '/static'];

function extractClientIp(headers: Headers): string | null {
	const forwardedFor = headers.get('x-forwarded-for');
	if (forwardedFor) {
		return forwardedFor.split(',')[0]?.trim() || null;
	}

	return headers.get('x-real-ip');
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname.startsWith('/api/auth')) {
		const response = await svelteKitHandler({ event, resolve, auth, building });
		if (
			response.status === 429 &&
			(pathname.startsWith('/api/auth/sign-up') ||
				pathname.startsWith('/api/auth/sign-in') ||
				pathname.startsWith('/api/auth/forget-password'))
		) {
			logger.warn(
				{
					path: pathname,
					ip: extractClientIp(event.request.headers),
					userAgent: event.request.headers.get('user-agent')
				},
				'auth_rate_limit_exceeded'
			);
		}

		return response;
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
		event.locals.userId = session.user?.id;
	}

	const isPublic =
		publicPaths.has(pathname) || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

	if (!session && !isPublic) {
		if (pathname.startsWith('/api')) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}
		throw redirect(302, `/sign-in?redirect=${encodeURIComponent(pathname)}`);
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
