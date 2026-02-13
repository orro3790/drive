import { z } from 'zod';

export const emergencyBonusPercentSchema = z.number().int().min(0).max(100);
export const rewardMinAttendancePercentSchema = z.number().int().min(0).max(100);
export const correctiveCompletionThresholdPercentSchema = z.number().int().min(0).max(100);

export const dispatchSettingsSchema = z
	.object({
		emergencyBonusPercent: emergencyBonusPercentSchema
	})
	.strict();

export const driverHealthSettingsSchema = z
	.object({
		rewardMinAttendancePercent: rewardMinAttendancePercentSchema,
		correctiveCompletionThresholdPercent: correctiveCompletionThresholdPercentSchema
	})
	.strict();

export const dispatchSettingsPatchSchema = z
	.object({
		emergencyBonusPercent: emergencyBonusPercentSchema.optional(),
		rewardMinAttendancePercent: rewardMinAttendancePercentSchema.optional(),
		correctiveCompletionThresholdPercent: correctiveCompletionThresholdPercentSchema.optional()
	})
	.strict()
	.refine(
		(value) =>
			value.emergencyBonusPercent !== undefined ||
			value.rewardMinAttendancePercent !== undefined ||
			value.correctiveCompletionThresholdPercent !== undefined,
		{ message: 'At least one dispatch setting is required' }
	);

export type DispatchSettingsInput = z.infer<typeof dispatchSettingsSchema>;
export type DriverHealthSettingsInput = z.infer<typeof driverHealthSettingsSchema>;
export type DispatchSettingsPatchInput = z.infer<typeof dispatchSettingsPatchSchema>;
