/**
 * Settings Page Server
 *
 * Passes user data to the settings page.
 */

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	return { user };
};
