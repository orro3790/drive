/**
 * Push Notification Service
 *
 * Firebase Cloud Messaging integration for sending push notifications.
 * See docs/specs/SPEC.md § Notifications for notification types.
 */

import { db } from '$lib/server/db';
import { notifications, user } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import logger from '$lib/server/logger';
import {
	FIREBASE_PROJECT_ID,
	FIREBASE_CLIENT_EMAIL,
	FIREBASE_PRIVATE_KEY
} from '$env/static/private';
import type { App } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';

// Lazy-initialized Firebase Admin app
let firebaseApp: App | null = null;

/**
 * Notification types as defined in the spec.
 */
export type NotificationType =
	| 'shift_reminder'
	| 'bid_open'
	| 'bid_won'
	| 'bid_lost'
	| 'shift_cancelled'
	| 'warning'
	| 'manual'
	| 'schedule_locked'
	| 'assignment_confirmed';

/**
 * Title and body templates for each notification type.
 */
const NOTIFICATION_TEMPLATES: Record<NotificationType, { title: string; body: string }> = {
	shift_reminder: {
		title: 'Shift Reminder',
		body: 'Your shift starts today. Check the app for details.'
	},
	bid_open: {
		title: 'Bid Window Open',
		body: 'A new shift is available for bidding. Place your bid now!'
	},
	bid_won: {
		title: 'Bid Won!',
		body: 'Congratulations! You won the bid for your requested shift.'
	},
	bid_lost: {
		title: 'Bid Not Selected',
		body: 'Another driver was selected for this shift. Keep bidding!'
	},
	shift_cancelled: {
		title: 'Shift Cancelled',
		body: 'Your scheduled shift has been cancelled. Check the app for details.'
	},
	warning: {
		title: 'Account Warning',
		body: 'Your attendance has dropped below the required threshold. Please review your account.'
	},
	manual: {
		title: 'Message from Manager',
		body: 'You have a new message. Check the app for details.'
	},
	schedule_locked: {
		title: 'Preferences Locked',
		body: 'Your preferences for next week have been locked. Schedule generation is in progress.'
	},
	assignment_confirmed: {
		title: 'Shift Assigned',
		body: 'You have been assigned a new shift. Check your schedule.'
	}
};

/**
 * Initialize Firebase Admin SDK lazily.
 * Returns the messaging instance or null if credentials are missing.
 */
async function getMessaging(): Promise<Messaging | null> {
	if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
		logger.warn('Firebase credentials not configured, push notifications disabled');
		return null;
	}

	if (!firebaseApp) {
		try {
			const { initializeApp, getApps, cert } = await import('firebase-admin/app');

			// Check if already initialized
			const apps = getApps();
			if (apps.length > 0) {
				firebaseApp = apps[0];
			} else {
				firebaseApp = initializeApp({
					credential: cert({
						projectId: FIREBASE_PROJECT_ID,
						clientEmail: FIREBASE_CLIENT_EMAIL,
						// Private key comes with escaped newlines, need to unescape
						privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
					})
				});
			}

			logger.info('Firebase Admin SDK initialized');
		} catch (error) {
			logger.error({ error }, 'Failed to initialize Firebase Admin SDK');
			return null;
		}
	}

	const { getMessaging } = await import('firebase-admin/messaging');
	return getMessaging(firebaseApp);
}

export interface SendNotificationOptions {
	/** Additional data payload for the notification */
	data?: Record<string, string>;
	/** Custom title (overrides template) */
	customTitle?: string;
	/** Custom body (overrides template) */
	customBody?: string;
}

export interface SendNotificationResult {
	/** Whether in-app notification was created */
	inAppCreated: boolean;
	/** Whether push notification was sent */
	pushSent: boolean;
	/** Error message if push failed */
	pushError?: string;
}

/**
 * Send a notification to a user.
 *
 * Creates an in-app notification record and optionally sends a push notification
 * via FCM if the user has registered an FCM token.
 *
 * @param userId - The user ID to send the notification to
 * @param type - The notification type
 * @param options - Optional customization
 */
export async function sendNotification(
	userId: string,
	type: NotificationType,
	options: SendNotificationOptions = {}
): Promise<SendNotificationResult> {
	const log = logger.child({ operation: 'sendNotification', userId, type });
	const result: SendNotificationResult = {
		inAppCreated: false,
		pushSent: false
	};

	const template = NOTIFICATION_TEMPLATES[type];
	const title = options.customTitle || template.title;
	const body = options.customBody || template.body;

	// Create in-app notification record
	try {
		await db.insert(notifications).values({
			userId,
			type,
			title,
			body,
			data: options.data || null
		});
		result.inAppCreated = true;
		log.debug('In-app notification created');
	} catch (error) {
		log.error({ error }, 'Failed to create in-app notification');
		// Continue to try push notification
	}

	// Get user's FCM token
	const [userData] = await db
		.select({ fcmToken: user.fcmToken })
		.from(user)
		.where(eq(user.id, userId));

	if (!userData?.fcmToken) {
		log.debug('User has no FCM token, skipping push notification');
		return result;
	}

	// Send push notification via FCM
	const messaging = await getMessaging();
	if (!messaging) {
		log.debug('FCM not available, skipping push notification');
		return result;
	}

	try {
		await messaging.send({
			token: userData.fcmToken,
			notification: {
				title,
				body
			},
			data: options.data,
			// Android-specific settings
			android: {
				priority: 'high' as const,
				notification: {
					channelId: 'drive_notifications'
				}
			},
			// iOS-specific settings
			apns: {
				payload: {
					aps: {
						sound: 'default',
						badge: 1
					}
				}
			}
		});

		result.pushSent = true;
		log.info('Push notification sent');
	} catch (error) {
		// FCM errors are common (invalid token, user uninstalled app, etc.)
		// Log but don't throw - the in-app notification is still created
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		result.pushError = errorMessage;
		log.warn({ error: errorMessage }, 'Failed to send push notification');

		// If token is invalid, we could clear it from the user record
		// but that's better handled by the client re-registering on app open
	}

	return result;
}

/**
 * Send a notification to multiple users.
 *
 * @param userIds - Array of user IDs
 * @param type - The notification type
 * @param options - Optional customization
 */
export async function sendBulkNotifications(
	userIds: string[],
	type: NotificationType,
	options: SendNotificationOptions = {}
): Promise<Map<string, SendNotificationResult>> {
	const results = new Map<string, SendNotificationResult>();

	// Send notifications in parallel (but limit concurrency to avoid overwhelming FCM)
	const BATCH_SIZE = 10;
	for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
		const batch = userIds.slice(i, i + BATCH_SIZE);
		const batchResults = await Promise.all(
			batch.map(async (userId) => {
				const result = await sendNotification(userId, type, options);
				return { userId, result };
			})
		);

		for (const { userId, result } of batchResults) {
			results.set(userId, result);
		}
	}

	return results;
}
