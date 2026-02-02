/**
 * Server Hooks - Auth Middleware
 */

import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// Get session from Better Auth
	const session = await auth.api.getSession({ headers: event.request.headers });

	event.locals.session = session?.session;
	event.locals.user = session?.user;
	event.locals.userId = session?.user?.id;

	// Public paths that don't require auth
	const publicPaths = ['/', '/sign-in', '/sign-up', '/api/auth'];
	const isPublicPath = publicPaths.some(
		(path) => event.url.pathname === path || event.url.pathname.startsWith('/api/auth')
	);

	// Redirect to sign-in if not authenticated and accessing protected route
	if (!session && !isPublicPath) {
		return new Response(null, {
			status: 302,
			headers: { location: '/sign-in' }
		});
	}

	return resolve(event);
};
