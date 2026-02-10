import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { db } from '$lib/server/db';
import { dispatchSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const GLOBAL_DISPATCH_SETTINGS_ID = 'global';
const DEFAULT_EMERGENCY_BONUS_PERCENT = dispatchPolicy.bidding.emergencyBonusPercent;

export type DispatchSettingsRecord = {
	id: string;
	emergencyBonusPercent: number;
	updatedBy: string | null;
	updatedAt: Date;
};

async function selectGlobalDispatchSettings(): Promise<DispatchSettingsRecord | null> {
	const [row] = await db
		.select({
			id: dispatchSettings.id,
			emergencyBonusPercent: dispatchSettings.emergencyBonusPercent,
			updatedBy: dispatchSettings.updatedBy,
			updatedAt: dispatchSettings.updatedAt
		})
		.from(dispatchSettings)
		.where(eq(dispatchSettings.id, GLOBAL_DISPATCH_SETTINGS_ID))
		.limit(1);

	return row ?? null;
}

async function ensureGlobalDispatchSettings(): Promise<DispatchSettingsRecord> {
	await db
		.insert(dispatchSettings)
		.values({
			id: GLOBAL_DISPATCH_SETTINGS_ID,
			emergencyBonusPercent: DEFAULT_EMERGENCY_BONUS_PERCENT
		})
		.onConflictDoNothing();

	const existing = await selectGlobalDispatchSettings();
	if (!existing) {
		throw new Error('Failed to initialize dispatch settings');
	}

	return existing;
}

export async function getDispatchSettings(): Promise<DispatchSettingsRecord> {
	const existing = await selectGlobalDispatchSettings();
	if (existing) {
		return existing;
	}

	return ensureGlobalDispatchSettings();
}

export async function updateDispatchSettings(params: {
	emergencyBonusPercent: number;
	actorId: string;
}): Promise<DispatchSettingsRecord> {
	const updatedAt = new Date();

	const [updated] = await db
		.insert(dispatchSettings)
		.values({
			id: GLOBAL_DISPATCH_SETTINGS_ID,
			emergencyBonusPercent: params.emergencyBonusPercent,
			updatedBy: params.actorId,
			updatedAt
		})
		.onConflictDoUpdate({
			target: dispatchSettings.id,
			set: {
				emergencyBonusPercent: params.emergencyBonusPercent,
				updatedBy: params.actorId,
				updatedAt
			}
		})
		.returning({
			id: dispatchSettings.id,
			emergencyBonusPercent: dispatchSettings.emergencyBonusPercent,
			updatedBy: dispatchSettings.updatedBy,
			updatedAt: dispatchSettings.updatedAt
		});

	if (updated) {
		return updated;
	}

	return ensureGlobalDispatchSettings();
}

export async function getEmergencyBonusPercent(): Promise<number> {
	try {
		const settings = await getDispatchSettings();
		return settings.emergencyBonusPercent;
	} catch {
		return DEFAULT_EMERGENCY_BONUS_PERCENT;
	}
}
