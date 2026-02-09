import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { revokeOnboardingEntry } from '$lib/server/services/onboarding';

export const PATCH: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const updated = await revokeOnboardingEntry(params.id, locals.user.id);
	if (!updated) {
		throw error(404, 'Onboarding entry not found');
	}

	return json({ entry: updated });
};
