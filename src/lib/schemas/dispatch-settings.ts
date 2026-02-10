import { z } from 'zod';

export const emergencyBonusPercentSchema = z.number().int().min(0).max(100);

export const dispatchSettingsSchema = z
	.object({
		emergencyBonusPercent: emergencyBonusPercentSchema
	})
	.strict();

export type DispatchSettingsInput = z.infer<typeof dispatchSettingsSchema>;
