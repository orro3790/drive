import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { signupOnboardingReservationIdSchema } from '$lib/schemas/onboarding';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import { restoreOnboardingEntry } from '$lib/server/services/onboarding';

export const PATCH: RequestHandler = async ({ locals, params }) => {
	requireManagerWithOrg(locals);

	const idResult = signupOnboardingReservationIdSchema.safeParse(params.id);
	if (!idResult.success) {
		throw error(400, 'Invalid onboarding entry ID');
	}

	const result = await restoreOnboardingEntry(idResult.data);

	if (!result.restored) {
		switch (result.reason) {
			case 'not_found':
				throw error(404, 'Onboarding entry not found');
			case 'not_revoked':
				throw error(400, 'Entry is not revoked');
			case 'conflict':
				throw error(409, 'Another active entry exists for this email');
		}
	}

	return json({ entry: result.entry });
};
