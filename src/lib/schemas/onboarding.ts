import { z } from 'zod';

const onboardingEmailSchema = z
	.string()
	.trim()
	.email()
	.transform((value) => value.toLowerCase());

export const signupOnboardingKindSchema = z.enum(['approval', 'invite']);
export type SignupOnboardingKind = z.infer<typeof signupOnboardingKindSchema>;

export const signupOnboardingStatusSchema = z.enum(['pending', 'reserved', 'consumed', 'revoked']);
export type SignupOnboardingStatus = z.infer<typeof signupOnboardingStatusSchema>;

export const signupOnboardingReservationIdSchema = z.string().uuid();
export type SignupOnboardingReservationId = z.infer<typeof signupOnboardingReservationIdSchema>;

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

export const authSignupReturnedUserSchema = z.object({
	id: z.string().min(1),
	email: onboardingEmailSchema
});

export const authSignupReturnedPayloadSchema = z.object({
	user: authSignupReturnedUserSchema
});

export type AuthSignupReturnedPayload = z.infer<typeof authSignupReturnedPayloadSchema>;

export const signupFinalizeReconciliationSchema = z.object({
	reservationId: signupOnboardingReservationIdSchema,
	userId: z.string().min(1),
	email: onboardingEmailSchema,
	error: z.unknown().optional()
});

export type SignupFinalizeReconciliationInput = z.infer<typeof signupFinalizeReconciliationSchema>;
