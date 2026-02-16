/**
 * Push Notification Initialization
 *
 * Handles Capacitor push notification setup on native platforms.
 * - Requests notification permission
 * - Registers for push notifications
 * - Sends FCM token to server
 *
 * IMPORTANT: On Android 13+, permission requests must be triggered by user action.
 * Use checkPushPermissionStatus() to check if permission is needed, then show
 * an in-app prompt. Only call requestPushPermission() after user taps a button.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

const ANDROID_PUSH_CHANNEL_ID = 'drive_notifications';
const FCM_TOKEN_STORAGE_KEY = 'fcmToken';
const MAX_TOKEN_REGISTER_ATTEMPTS = 3;

let pushListenersReady = false;
let appStateListenerReady = false;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCachedFcmToken(): string | null {
	try {
		return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
	} catch {
		return null;
	}
}

function setupAppStateListener(): void {
	if (appStateListenerReady) {
		return;
	}

	appStateListenerReady = true;
	void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
		if (!isActive) {
			return;
		}

		const cachedToken = readCachedFcmToken();
		if (cachedToken) {
			void registerTokenWithServer(cachedToken);
		}
	});
}

async function ensureAndroidPushChannel(): Promise<void> {
	if (!isNativePlatform() || Capacitor.getPlatform() !== 'android') {
		return;
	}

	try {
		await PushNotifications.createChannel({
			id: ANDROID_PUSH_CHANNEL_ID,
			name: 'Drive Notifications',
			description: 'Shift updates and alerts',
			importance: 5,
			visibility: 1,
			sound: 'default'
		});
		console.log('[Push] Android channel ready:', ANDROID_PUSH_CHANNEL_ID);
	} catch (error) {
		console.error('[Push] Failed to create Android channel:', error);
	}
}

/**
 * Check if we're running in a native Capacitor environment
 */
export function isNativePlatform(): boolean {
	return Capacitor.isNativePlatform();
}

/**
 * Check current push notification permission status.
 * Use this to determine if we need to show a permission prompt UI.
 */
export async function checkPushPermissionStatus(): Promise<PushPermissionStatus> {
	if (!isNativePlatform()) {
		return 'unknown';
	}

	try {
		const permStatus = await PushNotifications.checkPermissions();
		console.log('[Push] Permission status:', permStatus.receive);
		return permStatus.receive as PushPermissionStatus;
	} catch (error) {
		console.error('[Push] Failed to check permissions:', error);
		return 'unknown';
	}
}

/**
 * Request push notification permission.
 * MUST be called from a user-initiated action (button tap) on Android 13+.
 * Returns the resulting permission status.
 */
export async function requestPushPermission(): Promise<PushPermissionStatus> {
	if (!isNativePlatform()) {
		return 'unknown';
	}

	try {
		console.log('[Push] Requesting permission (user-initiated)...');
		const result = await PushNotifications.requestPermissions();
		console.log('[Push] Permission result:', result.receive);

		// If granted, complete the registration
		if (result.receive === 'granted') {
			await completePushRegistration();
		}

		return result.receive as PushPermissionStatus;
	} catch (error) {
		console.error('[Push] Failed to request permission:', error);
		return 'unknown';
	}
}

/**
 * Complete push notification registration (listeners + FCM).
 * Called automatically when permission is granted.
 */
async function completePushRegistration(): Promise<void> {
	try {
		setupPushListeners();
		setupAppStateListener();
		await ensureAndroidPushChannel();

		const cachedToken = readCachedFcmToken();
		if (cachedToken) {
			await registerTokenWithServer(cachedToken);
		}

		await PushNotifications.register();
		console.log('[Push] Registration complete');
	} catch (error) {
		console.error('[Push] Registration failed:', error);
	}
}

/**
 * Initialize push notifications on native platforms.
 * If permission is already granted, completes registration immediately.
 * If permission is 'prompt', delays slightly then requests (Android 13+ needs Activity ready).
 *
 * @returns 'granted' if set up, 'denied' if blocked, 'prompt' if dialog shown
 */
export async function initPushNotifications(): Promise<PushPermissionStatus> {
	if (!isNativePlatform()) {
		console.log('[Push] Skipping - not a native platform');
		return 'unknown';
	}

	console.log('[Push] Checking permission status...');

	try {
		const permStatus = await PushNotifications.checkPermissions();
		console.log('[Push] Current status:', permStatus.receive);

		if (permStatus.receive === 'granted') {
			// Already have permission - complete registration
			await completePushRegistration();
			return 'granted';
		}

		if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
			// Delay request slightly to ensure Android Activity is fully ready
			// This prevents the permission dialog from being suppressed on Android 13+
			console.log('[Push] Delaying permission request for Activity readiness...');
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log('[Push] Requesting permission...');
			const result = await PushNotifications.requestPermissions();
			console.log('[Push] Permission result:', result.receive);

			if (result.receive === 'granted') {
				await completePushRegistration();
				return 'granted';
			}
			return result.receive as PushPermissionStatus;
		}

		// Permission is 'denied' - user must enable in system settings
		console.log('[Push] Permission denied - user must enable in Settings');
		return 'denied';
	} catch (error) {
		console.error('[Push] Initialization failed:', error);
		return 'unknown';
	}
}

/**
 * Set up push notification event listeners
 */
function setupPushListeners(): void {
	if (pushListenersReady) {
		return;
	}

	pushListenersReady = true;

	// Registration success - we get the FCM token here
	PushNotifications.addListener('registration', async (token) => {
		console.log('[Push] Registration successful, token:', token.value.substring(0, 20) + '...');

		// Store token locally for reference
		try {
			localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token.value);
		} catch {
			// localStorage might not be available
		}

		// Send token to server
		await registerTokenWithServer(token.value);
	});

	// Registration error
	PushNotifications.addListener('registrationError', (error) => {
		console.error('[Push] Registration failed:', error);
	});

	// Notification received while app is in foreground
	PushNotifications.addListener('pushNotificationReceived', (notification) => {
		console.log('[Push] Notification received in foreground:', notification);
		// Could show an in-app toast or update notification badge
	});

	// User tapped on notification
	PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
		console.log('[Push] Notification action performed:', action);
		// Could navigate to relevant screen based on notification data
		const data = action.notification.data;
		if (data?.assignmentId) {
			// Navigate to assignment details
			window.location.href = '/dashboard';
		}
	});
}

/**
 * Send FCM token to server for storage
 */
async function registerTokenWithServer(token: string, attempt = 1): Promise<void> {
	if (!token) {
		return;
	}

	try {
		const response = await fetch('/api/users/fcm-token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token })
		});

		if (!response.ok) {
			throw new Error(`Server returned ${response.status}`);
		}

		console.log('[Push] Token registered with server');
	} catch (error) {
		if (attempt < MAX_TOKEN_REGISTER_ATTEMPTS) {
			const retryDelayMs = attempt * 1000;
			console.warn(
				`[Push] Token registration attempt ${attempt} failed, retrying in ${retryDelayMs}ms`,
				error
			);
			await sleep(retryDelayMs);
			return registerTokenWithServer(token, attempt + 1);
		}

		console.error('[Push] Failed to register token with server:', error);
	}
}

/**
 * Remove FCM token (for logout)
 */
export async function clearPushNotifications(): Promise<void> {
	if (!isNativePlatform()) {
		return;
	}

	try {
		// Remove all listeners
		await PushNotifications.removeAllListeners();
		pushListenersReady = false;
		appStateListenerReady = false;

		// Clear local storage
		try {
			localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
		} catch {
			// Ignore
		}

		// Tell server to remove token
		await fetch('/api/users/fcm-token', { method: 'DELETE' });

		console.log('[Push] Notifications cleared');
	} catch (error) {
		console.error('[Push] Failed to clear notifications:', error);
	}
}
