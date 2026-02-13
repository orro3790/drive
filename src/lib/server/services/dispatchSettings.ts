import { dispatchPolicy } from '$lib/config/dispatchPolicy';
import { db } from '$lib/server/db';
import { organizationDispatchSettings, organizations } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

const DEFAULT_EMERGENCY_BONUS_PERCENT = dispatchPolicy.bidding.emergencyBonusPercent;
const DEFAULT_REWARD_MIN_ATTENDANCE_PERCENT = Math.round(
	dispatchPolicy.flagging.reward.minAttendanceRate * 100
);
const DEFAULT_CORRECTIVE_COMPLETION_THRESHOLD_PERCENT = Math.round(
	dispatchPolicy.health.correctiveCompletionThreshold * 100
);

export type DispatchSettingsRecord = {
	organizationId: string;
	emergencyBonusPercent: number;
	rewardMinAttendancePercent: number;
	correctiveCompletionThresholdPercent: number;
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
			rewardMinAttendancePercent: organizationDispatchSettings.rewardMinAttendancePercent,
			correctiveCompletionThresholdPercent:
				organizationDispatchSettings.correctiveCompletionThresholdPercent,
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
			emergencyBonusPercent: DEFAULT_EMERGENCY_BONUS_PERCENT,
			rewardMinAttendancePercent: DEFAULT_REWARD_MIN_ATTENDANCE_PERCENT,
			correctiveCompletionThresholdPercent: DEFAULT_CORRECTIVE_COMPLETION_THRESHOLD_PERCENT
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
	emergencyBonusPercent?: number;
	rewardMinAttendancePercent?: number;
	correctiveCompletionThresholdPercent?: number;
	actorId: string;
}): Promise<DispatchSettingsRecord> {
	const resolvedOrganizationId = assertOrganizationId(params.organizationId);
	const updatedAt = new Date();

	const existing = await ensureDispatchSettings(resolvedOrganizationId);

	const emergencyBonusPercent = params.emergencyBonusPercent ?? existing.emergencyBonusPercent;
	const rewardMinAttendancePercent =
		params.rewardMinAttendancePercent ?? existing.rewardMinAttendancePercent;
	const correctiveCompletionThresholdPercent =
		params.correctiveCompletionThresholdPercent ?? existing.correctiveCompletionThresholdPercent;

	const [updated] = await db
		.insert(organizationDispatchSettings)
		.values({
			organizationId: resolvedOrganizationId,
			emergencyBonusPercent,
			rewardMinAttendancePercent,
			correctiveCompletionThresholdPercent,
			updatedBy: params.actorId,
			updatedAt
		})
		.onConflictDoUpdate({
			target: organizationDispatchSettings.organizationId,
			set: {
				emergencyBonusPercent,
				rewardMinAttendancePercent,
				correctiveCompletionThresholdPercent,
				updatedBy: params.actorId,
				updatedAt
			}
		})
		.returning({
			organizationId: organizationDispatchSettings.organizationId,
			emergencyBonusPercent: organizationDispatchSettings.emergencyBonusPercent,
			rewardMinAttendancePercent: organizationDispatchSettings.rewardMinAttendancePercent,
			correctiveCompletionThresholdPercent:
				organizationDispatchSettings.correctiveCompletionThresholdPercent,
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

export type DriverHealthPolicyThresholds = {
	rewardMinAttendancePercent: number;
	rewardMinAttendanceRate: number;
	correctiveCompletionThresholdPercent: number;
	correctiveCompletionThresholdRate: number;
};

export async function getDriverHealthPolicyThresholds(
	organizationId: string
): Promise<DriverHealthPolicyThresholds> {
	const settings = await getDispatchSettings(organizationId);

	return {
		rewardMinAttendancePercent: settings.rewardMinAttendancePercent,
		rewardMinAttendanceRate: settings.rewardMinAttendancePercent / 100,
		correctiveCompletionThresholdPercent: settings.correctiveCompletionThresholdPercent,
		correctiveCompletionThresholdRate: settings.correctiveCompletionThresholdPercent / 100
	};
}

export async function canManageDispatchSettings(params: {
	organizationId: string;
	userId: string;
}): Promise<boolean> {
	const resolvedOrganizationId = assertOrganizationId(params.organizationId);
	if (!params.userId) {
		return false;
	}

	const [organization] = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(
			and(
				eq(organizations.id, resolvedOrganizationId),
				eq(organizations.ownerUserId, params.userId)
			)
		)
		.limit(1);

	return Boolean(organization);
}
