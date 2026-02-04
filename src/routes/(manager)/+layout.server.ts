import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/sign-in');
	}

	// Only managers can access these routes
	if (locals.user.role !== 'manager') {
		throw redirect(302, '/dashboard');
	}

	return {
		user: locals.user
	};
};
