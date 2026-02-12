import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dispatchSettingsSchema } from '$lib/schemas/dispatch-settings';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import {
	getDispatchSettings,
	updateDispatchSettings,
	type DispatchSettingsRecord
} from '$lib/server/services/dispatchSettings';

function toDispatchSettingsResponse(settings: DispatchSettingsRecord) {
	return {
		emergencyBonusPercent: settings.emergencyBonusPercent,
		updatedBy: settings.updatedBy,
		updatedAt: settings.updatedAt.toISOString()
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	requireManagerWithOrg(locals);

	try {
		const settings = await getDispatchSettings();
		return json({ settings: toDispatchSettingsResponse(settings) });
	} catch {
		return json({
			settings: {
				emergencyBonusPercent: dispatchPolicy.bidding.emergencyBonusPercent,
				updatedBy: null,
				updatedAt: new Date().toISOString()
			}
		});
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const { user } = requireManagerWithOrg(locals);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = dispatchSettingsSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Validation failed');
	}

	try {
		const settings = await updateDispatchSettings({
			emergencyBonusPercent: parsed.data.emergencyBonusPercent,
			actorId: user.id
		});

		return json({ settings: toDispatchSettingsResponse(settings) });
	} catch {
		return json({ message: 'Dispatch settings are unavailable right now.' }, { status: 503 });
	}
};
