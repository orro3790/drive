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

export const signupOrganizationModeSchema = z.enum(['create', 'join']);
export type SignupOrganizationMode = z.infer<typeof signupOrganizationModeSchema>;

export const signupOrganizationRoleSchema = z.enum(['driver', 'manager']);
export type SignupOrganizationRole = z.infer<typeof signupOrganizationRoleSchema>;

export const signupOrganizationNameSchema = z.string().trim().min(2).max(80);
export const signupOrganizationCodeSchema = z.string().trim().min(4).max(64);

export const signupOrganizationMetadataSchema = z.discriminatedUnion('mode', [
	z.object({
		mode: z.literal('create'),
		organizationName: signupOrganizationNameSchema
	}),
	z.object({
		mode: z.literal('join'),
		organizationCode: signupOrganizationCodeSchema
	})
]);

export type SignupOrganizationMetadata = z.infer<typeof signupOrganizationMetadataSchema>;

export const onboardingApprovalCreateSchema = z.object({
	kind: z.literal('approval'),
	email: onboardingEmailSchema
});

export const onboardingCreateSchema = onboardingApprovalCreateSchema;

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

export const signupCreateOrganizationFinalizeReconciliationSchema = z.object({
	userId: z.string().min(1),
	email: onboardingEmailSchema,
	organizationName: signupOrganizationNameSchema,
	error: z.unknown().optional()
});

export type SignupCreateOrganizationFinalizeReconciliationInput = z.infer<
	typeof signupCreateOrganizationFinalizeReconciliationSchema
>;
