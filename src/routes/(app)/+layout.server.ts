/**
 * App Layout Server - Auth Guard (Any Role)
 *
 * Ensures user is authenticated. Allows any role.
 * Used for shared pages like settings that work for both drivers and managers.
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/sign-in');
	}

	return {
		user: locals.user
	};
};
