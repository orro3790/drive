import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { signupOnboardingReservationIdSchema } from '$lib/schemas/onboarding';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import { revokeOnboardingEntry } from '$lib/server/services/onboarding';

export const PATCH: RequestHandler = async ({ locals, params }) => {
	const { user } = requireManagerWithOrg(locals);

	const idResult = signupOnboardingReservationIdSchema.safeParse(params.id);
	if (!idResult.success) {
		throw error(400, 'Invalid onboarding entry ID');
	}

	const updated = await revokeOnboardingEntry(idResult.data, user.id);
	if (!updated) {
		throw error(404, 'Onboarding entry not found');
	}

	return json({ entry: updated });
};
