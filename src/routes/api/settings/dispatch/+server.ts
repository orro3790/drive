import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dispatchSettingsPatchSchema } from '$lib/schemas/dispatch-settings';
import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { requireManagerWithOrg } from '$lib/server/org-scope';
import {
	canManageDispatchSettings,
	getDispatchSettings,
	updateDispatchSettings,
	type DispatchSettingsRecord
} from '$lib/server/services/dispatchSettings';

function toDispatchSettingsResponse(settings: DispatchSettingsRecord) {
	return {
		emergencyBonusPercent: settings.emergencyBonusPercent,
		rewardMinAttendancePercent: settings.rewardMinAttendancePercent,
		correctiveCompletionThresholdPercent: settings.correctiveCompletionThresholdPercent,
		updatedBy: settings.updatedBy,
		updatedAt: settings.updatedAt.toISOString()
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user, organizationId } = requireManagerWithOrg(locals);

	let canEditEmergencyBonusPercent = false;
	try {
		canEditEmergencyBonusPercent = await canManageDispatchSettings({
			organizationId,
			userId: user.id
		});
	} catch {
		canEditEmergencyBonusPercent = false;
	}

	try {
		const settings = await getDispatchSettings(organizationId);
		return json({
			settings: toDispatchSettingsResponse(settings),
			permissions: {
				canEditEmergencyBonusPercent,
				canEditDriverHealthSettings: canEditEmergencyBonusPercent
			}
		});
	} catch {
		return json({
			settings: {
				emergencyBonusPercent: dispatchPolicy.bidding.emergencyBonusPercent,
				rewardMinAttendancePercent: Math.round(
					dispatchPolicy.flagging.reward.minAttendanceRate * 100
				),
				correctiveCompletionThresholdPercent: Math.round(
					dispatchPolicy.health.correctiveCompletionThreshold * 100
				),
				updatedBy: null,
				updatedAt: new Date().toISOString()
			},
			permissions: {
				canEditEmergencyBonusPercent,
				canEditDriverHealthSettings: canEditEmergencyBonusPercent
			}
		});
	}
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const { user, organizationId } = requireManagerWithOrg(locals);

	let canEditEmergencyBonusPercent = false;
	try {
		canEditEmergencyBonusPercent = await canManageDispatchSettings({
			organizationId,
			userId: user.id
		});
	} catch {
		return json({ message: 'Dispatch settings are unavailable right now.' }, { status: 503 });
	}

	if (!canEditEmergencyBonusPercent) {
		throw error(403, 'Forbidden');
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON body');
	}

	const parsed = dispatchSettingsPatchSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, 'Validation failed');
	}

	try {
		const settings = await updateDispatchSettings({
			organizationId,
			emergencyBonusPercent: parsed.data.emergencyBonusPercent,
			rewardMinAttendancePercent: parsed.data.rewardMinAttendancePercent,
			correctiveCompletionThresholdPercent: parsed.data.correctiveCompletionThresholdPercent,
			actorId: user.id
		});

		return json({ settings: toDispatchSettingsResponse(settings) });
	} catch {
		return json({ message: 'Dispatch settings are unavailable right now.' }, { status: 503 });
	}
};
