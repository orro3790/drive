/**
 * Manager Layout Server - Role Guard
 *
 * Ensures only users with role='manager' can access (manager) routes.
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Auth middleware already populated locals.user in hooks.server.ts
	if (!locals.user) {
		throw redirect(302, '/sign-in');
	}

	// Role check - only managers can access this section
	if (locals.user.role !== 'manager') {
		throw redirect(302, '/?error=access_denied');
	}

	return {
		user: locals.user
	};
};
