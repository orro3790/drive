/**
 * User Settings Schemas
 *
 * Source of truth for account updates and password changes.
 */

import { z } from 'zod';

export const userProfileUpdateSchema = z.object({
	name: z.string().trim().min(1),
	email: z.string().trim().min(1).email(),
	phone: z.string().trim().max(32).nullable().optional()
});

export type UserProfileUpdate = z.infer<typeof userProfileUpdateSchema>;

export const userPasswordUpdateSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8)
});

export type UserPasswordUpdate = z.infer<typeof userPasswordUpdateSchema>;
