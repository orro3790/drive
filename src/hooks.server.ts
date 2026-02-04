/**
 * Server Hooks - Auth Middleware
 *
 * Uses Better Auth's svelteKitHandler for API routes,
 * with custom protection and role-based redirects.
 */

import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
	// Get session from Better Auth
	const session = await auth.api.getSession({ headers: event.request.headers });

	event.locals.session = session?.session;
	event.locals.user = session?.user as App.Locals['user'];
	event.locals.userId = session?.user?.id;

	const pathname = event.url.pathname;

	// Public paths that don't require auth
	const publicPaths = ['/', '/sign-in', '/sign-up', '/api/auth'];
	const isPublicPath = publicPaths.some(
		(path) => pathname === path || pathname.startsWith('/api/auth')
	);

	// Manager-only paths (routes under /(manager) group)
	const managerPaths = ['/routes', '/drivers', '/warehouses'];
	const isManagerPath = managerPaths.some((path) => pathname.startsWith(path));


	// Handle unauthenticated users
	if (!session && !isPublicPath) {
		return new Response(null, {
			status: 302,
			headers: { location: '/sign-in' }
		});
	}

	// Handle authenticated users on public paths (redirect to their home)
	if (session && (pathname === '/' || pathname === '/sign-in' || pathname === '/sign-up')) {
		const redirectTo = event.locals.user?.role === 'manager' ? '/routes' : '/dashboard';
		return new Response(null, {
			status: 302,
			headers: { location: redirectTo }
		});
	}

	// Role-based access control
	if (session && event.locals.user) {
		const role = event.locals.user.role;

		// Prevent drivers from accessing manager routes
		if (isManagerPath && role !== 'manager') {
			return new Response(null, {
				status: 302,
				headers: { location: '/dashboard' }
			});
		}

		// Prevent managers from accessing driver-only routes (except shared ones)
		// Settings and notifications are shared between roles
		const driverOnlyPaths = ['/dashboard', '/schedule'];
		const isDriverOnlyPath = driverOnlyPaths.some((path) => pathname.startsWith(path));
		if (isDriverOnlyPath && role === 'manager') {
			return new Response(null, {
				status: 302,
				headers: { location: '/routes' }
			});
		}
	}

	// Let Better Auth handle its API routes
	return svelteKitHandler({ event, resolve, auth, building });
};
