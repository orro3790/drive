import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { signupOnboardingReservationIdSchema } from '$lib/schemas/onboarding';
import { revokeOnboardingEntry } from '$lib/server/services/onboarding';

export const PATCH: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const idResult = signupOnboardingReservationIdSchema.safeParse(params.id);
	if (!idResult.success) {
		throw error(400, 'Invalid onboarding entry ID');
	}

	const updated = await revokeOnboardingEntry(idResult.data, locals.user.id);
	if (!updated) {
		throw error(404, 'Onboarding entry not found');
	}

	return json({ entry: updated });
};
