/**
 * Driver Layout Server - Role Guard
 *
 * Ensures only users with role='driver' can access (driver) routes.
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/sign-in');
	}

	if (locals.user.role !== 'driver') {
		throw redirect(302, '/?error=access_denied');
	}

	return {
		user: locals.user
	};
};
