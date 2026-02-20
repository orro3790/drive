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
import { canDriverTakeAssignment, getWeekStartForDateString } from './scheduling';
import {
	FIREBASE_PROJECT_ID,
	FIREBASE_CLIENT_EMAIL,
	FIREBASE_PRIVATE_KEY
} from '$env/static/private';
import type { App } from 'firebase-admin/app';
import type { Messaging } from 'firebase-admin/messaging';
import * as m from '$lib/paraglide/messages.js';
import type { Locale } from '$lib/paraglide/runtime.js';

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
		body: 'Your completion rate has dropped below 98%. Improve within 7 days to avoid further impact.'
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
 * Get localized default notification text for a given type and locale.
 * Used as fallback when callers don't provide renderTitle/renderBody.
 */
function getDefaultNotificationText(
	type: NotificationType,
	locale: Locale
): { title: string; body: string } {
	const opt = { locale };
	switch (type) {
		case 'shift_reminder':
			return {
				title: m.notif_shift_reminder_title({}, opt),
				body: m.notif_shift_reminder_body(
					{ routeName: '', warehouseName: '', shiftContext: '' },
					opt
				)
			};
		case 'bid_open':
			return {
				title: m.notif_bid_open_title({}, opt),
				body: m.notif_bid_open_body({ routeName: '', date: '', closeTime: '' }, opt)
			};
		case 'bid_won':
			return {
				title: m.notif_bid_won_title({}, opt),
				body: m.notif_bid_won_body({ routeName: '', shiftContext: '' }, opt)
			};
		case 'bid_lost':
			return {
				title: m.notif_bid_lost_title({}, opt),
				body: m.notif_bid_lost_body({ routeName: '', shiftTime: '' }, opt)
			};
		case 'shift_cancelled':
			return {
				title: m.notif_shift_cancelled_title({}, opt),
				body: m.notif_shift_cancelled_body({ routeName: '', shiftContext: '' }, opt)
			};
		case 'warning':
			return {
				title: m.notif_warning_title({}, opt),
				body: m.notif_warning_body({}, opt)
			};
		case 'manual':
			return {
				title: m.notif_manual_title({}, opt),
				body: m.notif_manual_body({}, opt)
			};
		case 'schedule_locked':
			return {
				title: m.notif_schedule_locked_title({}, opt),
				body: m.notif_schedule_locked_body({}, opt)
			};
		case 'assignment_confirmed':
			return {
				title: m.notif_assignment_confirmed_title({}, opt),
				body: m.notif_assignment_confirmed_body({ routeName: '', shiftContext: '' }, opt)
			};
		case 'route_unfilled':
			return {
				title: m.notif_route_unfilled_title({}, opt),
				body: m.notif_route_unfilled_body({ routeName: '', when: '' }, opt)
			};
		case 'route_cancelled':
			return {
				title: m.notif_route_cancelled_title({}, opt),
				body: m.notif_route_cancelled_body({}, opt)
			};
		case 'driver_no_show':
			return {
				title: m.notif_driver_no_show_title({}, opt),
				body: m.notif_driver_no_show_body({ driverName: '', when: '' }, opt)
			};
		case 'confirmation_reminder':
			return {
				title: m.notif_confirmation_reminder_title({}, opt),
				body: m.notif_confirmation_reminder_body({ date: '', routeName: '' }, opt)
			};
		case 'shift_auto_dropped':
			return {
				title: m.notif_shift_auto_dropped_title({}, opt),
				body: m.notif_shift_auto_dropped_body({ routeName: '', shiftContext: '' }, opt)
			};
		case 'emergency_route_available':
			return {
				title: m.notif_emergency_route_available_title({}, opt),
				body: m.notif_emergency_route_available_body(
					{ routeName: '', warehouseName: '', date: '', bonusText: '' },
					opt
				)
			};
		case 'streak_advanced':
			return {
				title: m.notif_streak_advanced_title({}, opt),
				body: m.notif_streak_advanced_body({ newStars: '', maxStars: '' }, opt)
			};
		case 'streak_reset':
			return {
				title: m.notif_streak_reset_title({}, opt),
				body: m.notif_streak_reset_body({ reason: '' }, opt)
			};
		case 'bonus_eligible':
			return {
				title: m.notif_bonus_eligible_title({}, opt),
				body: m.notif_bonus_eligible_body({ maxStars: '', bonusPercent: '' }, opt)
			};
		case 'corrective_warning':
			return {
				title: m.notif_corrective_warning_title({}, opt),
				body: m.notif_corrective_warning_body({ threshold: '' }, opt)
			};
		case 'return_exception':
			return {
				title: m.notif_return_exception_title({}, opt),
				body: m.notif_return_exception_body({ routeName: '', when: '' }, opt)
			};
		case 'stale_shift_reminder':
			return {
				title: m.notif_stale_shift_reminder_title({}, opt),
				body: m.notif_stale_shift_reminder_body({ date: '' }, opt)
			};
	}
}

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
			const { initializeApp, getApp, cert } = await import('firebase-admin/app');

			// Use a named app to survive Vite HMR. When HMR resets this module's
			// `firebaseApp` variable to null, the firebase-admin internal registry
			// still holds the app under this name — so we recover it cleanly.
			const appName = `drive-fcm-${FIREBASE_PROJECT_ID}`;
			try {
				firebaseApp = getApp(appName);
			} catch {
				// App doesn't exist yet — create it
				firebaseApp = initializeApp(
					{
						credential: cert({
							projectId: FIREBASE_PROJECT_ID,
							clientEmail: FIREBASE_CLIENT_EMAIL,
							// Private key comes with escaped newlines, need to unescape
							privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
						})
					},
					appName
				);
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
	/** Custom title (overrides template) — deprecated, use renderTitle */
	customTitle?: string;
	/** Custom body (overrides template) — deprecated, use renderBody */
	customBody?: string;
	/** Locale-aware title renderer (takes precedence over customTitle) */
	renderTitle?: (locale: Locale) => string;
	/** Locale-aware body renderer (takes precedence over customBody) */
	renderBody?: (locale: Locale) => string;
	/** Organization scope for recipient verification */
	organizationId?: string;
}

export interface SendNotificationResult {
	/** Whether in-app notification was created */
	inAppCreated: boolean;
	/** Whether push notification was sent */
	pushSent: boolean;
	/** Error category when push fails */
	pushError?: 'push_failed_transient' | 'push_failed_terminal';
	/** Provider error code when available */
	pushErrorCode?: string;
	/** Whether the failure is retryable */
	retryable?: boolean;
	/** Whether an invalid token was removed */
	tokenInvalidated?: boolean;
}

interface PushFailureClassification {
	category: 'transient' | 'terminal';
	code: string;
	retryable: boolean;
	invalidToken: boolean;
	errorCategory: string;
}

const FCM_INVALID_TOKEN_CODES = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token'
]);

const FCM_TRANSIENT_CODES = new Set([
	'messaging/internal-error',
	'messaging/server-unavailable',
	'messaging/quota-exceeded',
	'messaging/device-message-rate-exceeded',
	'messaging/message-rate-exceeded',
	'messaging/unavailable'
]);

const FCM_TERMINAL_CODES = new Set([
	'messaging/invalid-argument',
	'messaging/mismatched-credential',
	'messaging/authentication-error',
	'messaging/sender-id-mismatch',
	'messaging/third-party-auth-error',
	'messaging/too-many-topics'
]);

function extractErrorCode(error: unknown): string | undefined {
	if (!error || typeof error !== 'object') {
		return undefined;
	}

	const maybeError = error as { code?: unknown; errorInfo?: { code?: unknown } };
	if (typeof maybeError.code === 'string' && maybeError.code.length > 0) {
		return maybeError.code;
	}

	if (typeof maybeError.errorInfo?.code === 'string' && maybeError.errorInfo.code.length > 0) {
		return maybeError.errorInfo.code;
	}

	return undefined;
}

function classifyPushFailure(error: unknown): PushFailureClassification {
	const code = extractErrorCode(error) ?? 'unknown';
	const errorCategory = toSafeErrorMessage(error);

	if (FCM_INVALID_TOKEN_CODES.has(code)) {
		return {
			category: 'terminal',
			code,
			retryable: false,
			invalidToken: true,
			errorCategory
		};
	}

	if (FCM_TRANSIENT_CODES.has(code)) {
		return {
			category: 'transient',
			code,
			retryable: true,
			invalidToken: false,
			errorCategory
		};
	}

	if (FCM_TERMINAL_CODES.has(code)) {
		return {
			category: 'terminal',
			code,
			retryable: false,
			invalidToken: false,
			errorCategory
		};
	}

	return {
		category: 'terminal',
		code,
		retryable: false,
		invalidToken: false,
		errorCategory
	};
}

function sanitizePushData(data?: Record<string, string>): Record<string, string> | undefined {
	if (!data) {
		return undefined;
	}

	const entries = Object.entries(data)
		.filter(([, value]) => value !== null && value !== undefined)
		.map(([key, value]) => [key, String(value)] as const);

	if (entries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(entries);
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

	const pushData = sanitizePushData(options.data);

	const [recipient] = await db
		.select({
			fcmToken: user.fcmToken,
			organizationId: user.organizationId,
			preferredLocale: user.preferredLocale
		})
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

	const locale = (recipient.preferredLocale ?? 'en') as Locale;
	const defaultText = getDefaultNotificationText(type, locale);
	const title = options.renderTitle?.(locale) ?? options.customTitle ?? defaultText.title;
	const body = options.renderBody?.(locale) ?? options.customBody ?? defaultText.body;

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
			data: pushData,
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
		const failure = classifyPushFailure(error);
		result.pushError =
			failure.category === 'transient' ? 'push_failed_transient' : 'push_failed_terminal';
		result.pushErrorCode = failure.code;
		result.retryable = failure.retryable;
		result.tokenInvalidated = false;

		if (failure.invalidToken) {
			try {
				await db
					.update(user)
					.set({ fcmToken: null })
					.where(and(eq(user.id, userId), eq(user.fcmToken, recipient.fcmToken)));
				result.tokenInvalidated = true;
			} catch (cleanupError) {
				log.warn(
					{ cleanupErrorCategory: toSafeErrorMessage(cleanupError), fcmCode: failure.code },
					'Failed to clear invalid FCM token after terminal push failure'
				);
			}
		}

		log.warn(
			{
				errorCategory: failure.errorCategory,
				fcmCode: failure.code,
				retryable: failure.retryable,
				terminal: failure.category === 'terminal',
				tokenInvalidated: result.tokenInvalidated
			},
			'Failed to send push notification'
		);
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
	const log = logger.child({ operation: 'sendBulkNotifications', type });
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

	let inAppCreated = 0;
	let pushSent = 0;
	let pushFailedTransient = 0;
	let pushFailedTerminal = 0;
	let tokensInvalidated = 0;

	for (const result of results.values()) {
		if (result.inAppCreated) {
			inAppCreated++;
		}

		if (result.pushSent) {
			pushSent++;
		}

		if (result.pushError === 'push_failed_transient') {
			pushFailedTransient++;
		}

		if (result.pushError === 'push_failed_terminal') {
			pushFailedTerminal++;
		}

		if (result.tokenInvalidated) {
			tokensInvalidated++;
		}
	}

	log.info(
		{
			attempted: userIds.length,
			inAppCreated,
			pushSent,
			pushFailedTransient,
			pushFailedTerminal,
			tokensInvalidated
		},
		'Bulk notification outcome summary'
	);

	return results;
}

export interface ManagerAlertDetails {
	routeName?: string;
	driverName?: string;
	date?: string;
	warehouseName?: string;
	routeStartTime?: string;
}

function formatManagerAlertWhen(date: string, routeStartTime?: string): string {
	let dateLabel = date;

	try {
		dateLabel = format(toZonedTime(parseISO(date), TORONTO_TZ), 'EEE, MMM d');
	} catch {
		dateLabel = date;
	}

	if (!routeStartTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(routeStartTime)) {
		return dateLabel;
	}

	const [hourText, minuteText] = routeStartTime.split(':');
	const hour = Number(hourText);
	const minute = Number(minuteText);
	const period = hour >= 12 ? 'PM' : 'AM';
	const hour12 = hour % 12 || 12;

	return `${dateLabel} ${hour12}:${String(minute).padStart(2, '0')} ${period} ET`;
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

	const when = details.date ? formatManagerAlertWhen(details.date, details.routeStartTime) : '';

	await sendNotification(managerId, alertType, {
		renderBody: (locale) => {
			const opt = { locale };
			switch (alertType) {
				case 'route_unfilled':
					return m.notif_route_unfilled_body({ routeName: details.routeName ?? '', when }, opt);
				case 'route_cancelled':
					return m.notif_route_cancelled_body({}, opt);
				case 'driver_no_show':
					return m.notif_driver_no_show_body({ driverName: details.driverName ?? '', when }, opt);
				case 'return_exception':
					return m.notif_return_exception_body({ routeName: details.routeName ?? '', when }, opt);
			}
		},
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
		.select({ id: user.id, preferredLocale: user.preferredLocale })
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
	const assignmentWeekStart = getWeekStartForDateString(date);
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

	// Build locale map from eligible drivers
	const driverLocaleMap = new Map<string, Locale>();
	for (const driver of drivers) {
		if (eligibleDriverIds.includes(driver.id)) {
			driverLocaleMap.set(driver.id, (driver.preferredLocale ?? 'en') as Locale);
		}
	}

	const dateLabel = format(toZonedTime(parseISO(date), TORONTO_TZ), 'EEE, MMM d');
	const bonusText = payBonusPercent > 0 ? ` +${payBonusPercent}% bonus.` : '';
	const notificationData = {
		assignmentId,
		routeName,
		warehouseName,
		date,
		payBonusPercent: String(payBonusPercent),
		mode: 'emergency'
	};

	const notificationRecords = eligibleDriverIds.map((driverId) => {
		const locale = driverLocaleMap.get(driverId) ?? ('en' as Locale);
		const opt = { locale };
		return {
			organizationId,
			userId: driverId,
			type: 'emergency_route_available' as const,
			title: m.notif_emergency_route_available_title({}, opt),
			body: m.notif_emergency_route_available_body(
				{ routeName, warehouseName, date: dateLabel, bonusText },
				opt
			),
			data: notificationData
		};
	});

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

					const locale = driverLocaleMap.get(driverId) ?? ('en' as Locale);
					const opt = { locale };

					try {
						await messaging.send({
							token: userData.fcmToken,
							notification: {
								title: m.notif_emergency_route_available_title({}, opt),
								body: m.notif_emergency_route_available_body(
									{ routeName, warehouseName, date: dateLabel, bonusText },
									opt
								)
							},
							data: notificationData,
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
