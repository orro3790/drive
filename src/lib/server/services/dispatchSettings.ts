import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { db } from '$lib/server/db';
import { organizationDispatchSettings } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const DEFAULT_EMERGENCY_BONUS_PERCENT = dispatchPolicy.bidding.emergencyBonusPercent;

export type DispatchSettingsRecord = {
	organizationId: string;
	emergencyBonusPercent: number;
	updatedBy: string | null;
	updatedAt: Date;
};

function assertOrganizationId(organizationId: string): string {
	if (!organizationId) {
		throw new Error('Organization id is required');
	}

	return organizationId;
}

async function selectDispatchSettings(
	organizationId: string
): Promise<DispatchSettingsRecord | null> {
	const resolvedOrganizationId = assertOrganizationId(organizationId);

	const [row] = await db
		.select({
			organizationId: organizationDispatchSettings.organizationId,
			emergencyBonusPercent: organizationDispatchSettings.emergencyBonusPercent,
			updatedBy: organizationDispatchSettings.updatedBy,
			updatedAt: organizationDispatchSettings.updatedAt
		})
		.from(organizationDispatchSettings)
		.where(eq(organizationDispatchSettings.organizationId, resolvedOrganizationId))
		.limit(1);

	return row ?? null;
}

async function ensureDispatchSettings(organizationId: string): Promise<DispatchSettingsRecord> {
	const resolvedOrganizationId = assertOrganizationId(organizationId);

	await db
		.insert(organizationDispatchSettings)
		.values({
			organizationId: resolvedOrganizationId,
			emergencyBonusPercent: DEFAULT_EMERGENCY_BONUS_PERCENT
		})
		.onConflictDoNothing();

	const existing = await selectDispatchSettings(resolvedOrganizationId);
	if (!existing) {
		throw new Error('Failed to initialize dispatch settings');
	}

	return existing;
}

export async function getDispatchSettings(organizationId: string): Promise<DispatchSettingsRecord> {
	const resolvedOrganizationId = assertOrganizationId(organizationId);
	const existing = await selectDispatchSettings(resolvedOrganizationId);
	if (existing) {
		return existing;
	}

	return ensureDispatchSettings(resolvedOrganizationId);
}

export async function updateDispatchSettings(params: {
	organizationId: string;
	emergencyBonusPercent: number;
	actorId: string;
}): Promise<DispatchSettingsRecord> {
	const resolvedOrganizationId = assertOrganizationId(params.organizationId);
	const updatedAt = new Date();

	const [updated] = await db
		.insert(organizationDispatchSettings)
		.values({
			organizationId: resolvedOrganizationId,
			emergencyBonusPercent: params.emergencyBonusPercent,
			updatedBy: params.actorId,
			updatedAt
		})
		.onConflictDoUpdate({
			target: organizationDispatchSettings.organizationId,
			set: {
				emergencyBonusPercent: params.emergencyBonusPercent,
				updatedBy: params.actorId,
				updatedAt
			}
		})
		.returning({
			organizationId: organizationDispatchSettings.organizationId,
			emergencyBonusPercent: organizationDispatchSettings.emergencyBonusPercent,
			updatedBy: organizationDispatchSettings.updatedBy,
			updatedAt: organizationDispatchSettings.updatedAt
		});

	if (updated) {
		return updated;
	}

	return ensureDispatchSettings(resolvedOrganizationId);
}

export async function getEmergencyBonusPercent(organizationId: string): Promise<number> {
	const settings = await getDispatchSettings(organizationId);
	return settings.emergencyBonusPercent;
}
