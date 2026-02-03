/**
 * Root Page Server - Role-based Redirect
 *
 * Redirects authenticated users to their appropriate dashboard:
 * - Drivers → /schedule
 * - Managers → /routes
 *
 * Unauthenticated users see the public landing page.
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		// Not authenticated - redirect to sign-in
		throw redirect(302, '/sign-in');
	}

	// Redirect based on role
	if (locals.user.role === 'manager') {
		throw redirect(302, '/routes');
	}

	// Default for drivers (and any other role)
	throw redirect(302, '/schedule');
};
