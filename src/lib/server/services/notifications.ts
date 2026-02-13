/**
 * Push Notification Service
 *
 * Firebase Cloud Messaging integration for sending push notifications.
 * See documentation/specs/SPEC.md § Notifications for notification types.
 */

import { db } from '$lib/server/db';
import { assignments, notifications, shifts, user, warehouses } from '$lib/server/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { toZonedTime, format } from 'date-fns-tz';
import { parseISO } from 'date-fns';
import logger, { toSafeErrorMessage } from '$lib/server/logger';
import { getRouteManager } from './managers';
import { getWeekStart, canDriverTakeAssignment } from './scheduling';
import {
	FIREBASE_PROJECT_ID,
	FIREBASE_CLIENT_EMAIL,
	FIREBASE_PRIVATE_KEY
} from '$env/static/private';
import type { App } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';

const TORONTO_TZ = 'America/Toronto';

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
	| 'assignment_confirmed'
	| 'route_unfilled'
	| 'route_cancelled'
	| 'driver_no_show'
	| 'confirmation_reminder'
	| 'shift_auto_dropped'
	| 'emergency_route_available'
	| 'streak_advanced'
	| 'streak_reset'
	| 'bonus_eligible'
	| 'corrective_warning'
	| 'return_exception'
	| 'stale_shift_reminder';

/**
 * Subset of notification types used for manager alerts.
 */
export type ManagerAlertType =
	| 'route_unfilled'
	| 'route_cancelled'
	| 'driver_no_show'
	| 'return_exception';

/**
 * Title and body templates for each notification type.
 */
const NOTIFICATION_TEMPLATES: Record<NotificationType, { title: string; body: string }> = {
	shift_reminder: {
		title: 'Shift Reminder',
		body: 'Your shift starts today. Check the app for details.'
	},
	bid_open: {
		title: 'Shift Available',
		body: 'A shift is available for bidding. Place your bid now!'
	},
	bid_won: {
		title: 'Bid Won',
		body: "You've won the bid. You are now assigned this shift."
	},
	bid_lost: {
		title: 'Bid Not Won',
		body: 'Another driver was selected for this shift. No changes to your schedule.'
	},
	shift_cancelled: {
		title: 'Shift Cancelled',
		body: 'Your shift has been removed from your schedule.'
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
		body: 'You are now assigned a new shift. Check your schedule for details.'
	},
	route_unfilled: {
		title: 'Route Unfilled',
		body: 'A route at your warehouse has no driver assigned.'
	},
	route_cancelled: {
		title: 'Route Cancelled',
		body: 'This route has been cancelled and removed from affected schedules.'
	},
	driver_no_show: {
		title: 'Driver No-Show',
		body: 'A driver did not show up for their assigned shift.'
	},
	confirmation_reminder: {
		title: 'Confirm Your Shift',
		body: 'Your upcoming shift needs confirmation within 24 hours.'
	},
	shift_auto_dropped: {
		title: 'Shift Dropped',
		body: 'Your shift was not confirmed in time and has been removed from your schedule.'
	},
	emergency_route_available: {
		title: 'Shift Available',
		body: 'An urgent route is available with a bonus. First to accept gets it.'
	},
	streak_advanced: {
		title: 'Streak Milestone',
		body: 'Your weekly streak advanced! Keep up the great work.'
	},
	streak_reset: {
		title: 'Streak Reset',
		body: 'Your weekly streak has been reset due to a reliability event.'
	},
	bonus_eligible: {
		title: 'Bonus Eligible',
		body: 'Congratulations! You reached 4 stars and qualify for a +10% bonus preview.'
	},
	corrective_warning: {
		title: 'Completion Rate Warning',
		body: 'Your completion rate has dropped below 80%. Improve within 7 days to avoid further impact.'
	},
	return_exception: {
		title: 'Return Exception Filed',
		body: 'A driver filed return exceptions on A route.'
	},
	stale_shift_reminder: {
		title: 'Incomplete Shift',
		body: 'You have an incomplete shift. Please close it out to start new shifts.'
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
			logger.error(
				{ errorMessage: toSafeErrorMessage(error) },
				'Failed to initialize Firebase Admin SDK'
			);
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
	/** Organization scope for recipient verification */
	organizationId?: string;
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
	const log = logger.child({ operation: 'sendNotification', type });
	const result: SendNotificationResult = {
		inAppCreated: false,
		pushSent: false
	};

	const template = NOTIFICATION_TEMPLATES[type];
	const title = options.customTitle || template.title;
	const body = options.customBody || template.body;

	const [recipient] = await db
		.select({ fcmToken: user.fcmToken, organizationId: user.organizationId })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!recipient) {
		log.warn({ userId }, 'Recipient not found, skipping notification');
		return result;
	}

	if (options.organizationId && recipient.organizationId !== options.organizationId) {
		log.warn({ userId }, 'Recipient org mismatch, skipping notification');
		return result;
	}

	const notificationOrganizationId = options.organizationId ?? recipient.organizationId ?? null;

	// Create in-app notification record
	try {
		await db.insert(notifications).values({
			organizationId: notificationOrganizationId,
			userId,
			type,
			title,
			body,
			data: options.data || null
		});
		result.inAppCreated = true;
		log.debug('In-app notification created');
	} catch (error) {
		log.error({ errorMessage: toSafeErrorMessage(error) }, 'Failed to create in-app notification');
		// Continue to try push notification
	}

	if (!recipient.fcmToken) {
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
			token: recipient.fcmToken,
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
		const errorCategory = toSafeErrorMessage(error);
		result.pushError = 'push_failed';
		log.warn({ errorCategory }, 'Failed to send push notification');

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

export interface ManagerAlertDetails {
	routeName?: string;
	driverName?: string;
	date?: string;
	warehouseName?: string;
}

/**
 * Send alert notification to the primary manager of a route.
 *
 * @param routeId - The route UUID to look up manager
 * @param alertType - Type of alert to send
 * @param details - Additional context for the notification body
 * @returns true if notification sent, false if no manager assigned
 */
export async function sendManagerAlert(
	routeId: string,
	alertType: ManagerAlertType,
	details: ManagerAlertDetails = {},
	organizationId?: string
): Promise<boolean> {
	const log = logger.child({ operation: 'sendManagerAlert', alertType });
	if (!organizationId) {
		log.warn('Missing organization id, skipping manager alert');
		return false;
	}

	const managerId = await getRouteManager(routeId, organizationId);
	if (!managerId) {
		log.warn('No manager assigned to route, skipping alert');
		return false;
	}

	const template = NOTIFICATION_TEMPLATES[alertType];

	// Customize body with details
	let body = template.body;
	if (details.routeName) {
		body = body.replace('A route', `Route ${details.routeName}`);
		body = body.replace('A driver', details.driverName ?? 'A driver');
	}
	if (details.driverName && !details.routeName) {
		body = body.replace('A driver', details.driverName);
	}
	if (details.date) {
		body += ` (${details.date})`;
	}

	await sendNotification(managerId, alertType, {
		customBody: body,
		data: { routeId, ...details },
		organizationId
	});

	log.info('Manager alert sent');
	return true;
}

// ---------------------------------------------------------------------------
// Emergency route notifications
// ---------------------------------------------------------------------------

export interface EmergencyNotifyParams {
	organizationId: string;
	assignmentId: string;
	routeName: string;
	warehouseName: string;
	date: string;
	payBonusPercent: number;
}

/**
 * Notify available drivers about an emergency route.
 *
 * "Available" means:
 * - Role = driver
 * - Not flagged
 * - Not already on an active shift today (no arrivedAt on today's assignment)
 * - Under weekly cap for the assignment's week
 *
 * Creates in-app notification records and sends FCM push notifications.
 *
 * @returns Number of drivers notified
 */
export async function notifyAvailableDriversForEmergency(
	params: EmergencyNotifyParams
): Promise<number> {
	const { organizationId, assignmentId, routeName, warehouseName, date, payBonusPercent } = params;
	const log = logger.child({ operation: 'notifyAvailableDriversForEmergency' });

	if (!organizationId) {
		return 0;
	}

	const today = format(toZonedTime(new Date(), TORONTO_TZ), 'yyyy-MM-dd');

	// Subquery: drivers who have an active shift today (arrived or started)
	const driversOnShiftToday = db
		.select({ userId: assignments.userId })
		.from(assignments)
		.innerJoin(shifts, eq(assignments.id, shifts.assignmentId))
		.innerJoin(warehouses, eq(assignments.warehouseId, warehouses.id))
		.where(
			and(
				eq(assignments.date, today),
				eq(assignments.status, 'active'),
				isNotNull(assignments.userId),
				eq(warehouses.organizationId, organizationId)
			)
		);

	// Get all non-flagged drivers who are NOT on an active shift today
	const drivers = await db
		.select({ id: user.id })
		.from(user)
		.where(
			and(
				eq(user.role, 'driver'),
				eq(user.isFlagged, false),
				eq(user.organizationId, organizationId),
				sql`${user.id} NOT IN (${driversOnShiftToday})`
			)
		);

	if (drivers.length === 0) {
		log.info('No available drivers found');
		return 0;
	}

	// Filter by weekly cap
	const assignmentWeekStart = getWeekStart(parseISO(date));
	const eligibleDriverIds: string[] = [];
	for (const driver of drivers) {
		const canTake = await canDriverTakeAssignment(driver.id, assignmentWeekStart, organizationId);
		if (canTake) {
			eligibleDriverIds.push(driver.id);
		}
	}

	if (eligibleDriverIds.length === 0) {
		log.info('No drivers under weekly cap');
		return 0;
	}

	const dateLabel = format(toZonedTime(parseISO(date), TORONTO_TZ), 'EEE, MMM d');
	const bonusText = payBonusPercent > 0 ? ` +${payBonusPercent}% bonus.` : '';
	const body = `${routeName} at ${warehouseName} needs a driver on ${dateLabel}.${bonusText} First to accept gets it.`;

	const notificationRecords = eligibleDriverIds.map((driverId) => ({
		organizationId,
		userId: driverId,
		type: 'emergency_route_available' as const,
		title: 'Shift Available',
		body,
		data: {
			assignmentId,
			routeName,
			warehouseName,
			date,
			payBonusPercent: String(payBonusPercent),
			mode: 'emergency'
		}
	}));

	// Create in-app notification records
	await db.insert(notifications).values(notificationRecords);

	// Send FCM push notifications
	const messaging = await getMessaging();
	if (messaging) {
		const BATCH_SIZE = 10;
		for (let i = 0; i < eligibleDriverIds.length; i += BATCH_SIZE) {
			const batch = eligibleDriverIds.slice(i, i + BATCH_SIZE);
			await Promise.all(
				batch.map(async (driverId) => {
					const [userData] = await db
						.select({ fcmToken: user.fcmToken })
						.from(user)
						.where(and(eq(user.id, driverId), eq(user.organizationId, organizationId)));

					if (!userData?.fcmToken) return;

					try {
						await messaging.send({
							token: userData.fcmToken,
							notification: { title: 'Shift Available', body },
							data: {
								assignmentId,
								routeName,
								warehouseName,
								date,
								payBonusPercent: String(payBonusPercent),
								mode: 'emergency'
							},
							android: {
								priority: 'high' as const,
								notification: { channelId: 'drive_notifications' }
							},
							apns: {
								payload: { aps: { sound: 'default', badge: 1 } },
								headers: { 'apns-priority': '10' }
							}
						});
					} catch (error) {
						log.warn(
							{ errorMessage: toSafeErrorMessage(error) },
							'Failed to send emergency push notification'
						);
					}
				})
			);
		}
	}

	log.info({ count: eligibleDriverIds.length }, 'Emergency notifications sent');
	return eligibleDriverIds.length;
}
