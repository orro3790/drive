import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { onboardingCreateSchema } from '$lib/schemas/onboarding';
import {
	createOnboardingApproval,
	listSignupOnboardingEntries
} from '$lib/server/services/onboarding';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const entries = await listSignupOnboardingEntries();
	return json({ entries });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (locals.user.role !== 'manager') {
		throw error(403, 'Forbidden');
	}

	const body = await request.json().catch(() => null);
	if (body === null) {
		return json({ error: 'invalid_json' }, { status: 400 });
	}

	const parsed = onboardingCreateSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Validation failed');
	}

	const result = await createOnboardingApproval({
		email: parsed.data.email,
		createdBy: locals.user.id
	});

	if (result.alreadyExists) {
		return json({ error: 'entry_already_pending', entry: result.entry }, { status: 409 });
	}

	return json({ entry: result.entry }, { status: 201 });
};
