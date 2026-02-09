import { z } from 'zod';

const onboardingEmailSchema = z
	.string()
	.trim()
	.email()
	.transform((value) => value.toLowerCase());

export const onboardingApprovalCreateSchema = z.object({
	kind: z.literal('approval'),
	email: onboardingEmailSchema
});

export const onboardingInviteCreateSchema = z.object({
	kind: z.literal('invite'),
	email: onboardingEmailSchema,
	expiresInHours: z
		.number()
		.int()
		.min(1)
		.max(24 * 30)
		.optional()
});

export const onboardingCreateSchema = z.discriminatedUnion('kind', [
	onboardingApprovalCreateSchema,
	onboardingInviteCreateSchema
]);

export type OnboardingCreateInput = z.infer<typeof onboardingCreateSchema>;
