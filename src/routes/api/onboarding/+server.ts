import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { onboardingCreateSchema } from '$lib/schemas/onboarding';
import {
	createOnboardingApproval,
	createOnboardingInvite,
	listSignupOnboardingEntries
} from '$lib/server/services/onboarding';

const DEFAULT_INVITE_EXPIRY_HOURS = 24 * 7;

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

	const body = await request.json();
	const parsed = onboardingCreateSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Validation failed');
	}

	if (parsed.data.kind === 'approval') {
		const result = await createOnboardingApproval({
			email: parsed.data.email,
			createdBy: locals.user.id
		});

		if (result.alreadyExists) {
			return json({ error: 'entry_already_pending', entry: result.entry }, { status: 409 });
		}

		return json({ entry: result.entry }, { status: 201 });
	}

	const expiresInHours = parsed.data.expiresInHours ?? DEFAULT_INVITE_EXPIRY_HOURS;
	const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
	const result = await createOnboardingInvite({
		email: parsed.data.email,
		createdBy: locals.user.id,
		expiresAt
	});

	if (result.alreadyExists) {
		return json({ error: 'entry_already_pending', entry: result.entry }, { status: 409 });
	}

	if (!result.inviteCode) {
		throw error(500, 'Failed to create invite');
	}

	return json(
		{
			entry: result.entry,
			inviteCode: result.inviteCode
		},
		{ status: 201 }
	);
};
