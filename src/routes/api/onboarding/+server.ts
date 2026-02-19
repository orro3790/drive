import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { onboardingCreateSchema } from '$lib/schemas/onboarding';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import {
	createOnboardingApproval,
	listSignupOnboardingEntries
} from '$lib/server/services/onboarding';

export const GET: RequestHandler = async ({ locals }) => {
	const { organizationId } = requireManagerWithOrg(locals);

	const entries = await listSignupOnboardingEntries(organizationId);
	return json({ entries });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user, organizationId } = requireManagerWithOrg(locals);

	const body = await request.json().catch(() => null);
	if (body === null) {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = onboardingCreateSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Validation failed');
	}

	const result = await createOnboardingApproval({
		email: parsed.data.email,
		organizationId,
		createdBy: user.id
	});

	if (result.alreadyExists) {
		return json({ message: 'entry_already_pending', entry: result.entry }, { status: 409 });
	}

	return json({ entry: result.entry }, { status: 201 });
};
