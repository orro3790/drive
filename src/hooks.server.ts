/**
 * Server Hooks - Auth Middleware
 */

import type { Handle } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';

const publicPaths = new Set(['/', '/sign-in', '/sign-up']);
const publicPrefixes = ['/api/auth', '/_app', '/static'];

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname.startsWith('/api/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
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
