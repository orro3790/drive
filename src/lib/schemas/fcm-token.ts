/**
 * FCM Token Schema
 *
 * Validation schema for FCM token registration.
 */

import { z } from 'zod';

export const fcmTokenSchema = z.object({
	token: z.string().min(1).max(500)
});

export type FcmTokenInput = z.infer<typeof fcmTokenSchema>;
