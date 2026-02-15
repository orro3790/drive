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
import { PushNotifications } from '@capacitor/push-notifications';

export type PushPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

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
		await PushNotifications.register();
		console.log('[Push] Registration complete');
	} catch (error) {
		console.error('[Push] Registration failed:', error);
	}
}

/**
 * Initialize push notifications on native platforms.
 * Only completes registration if permission is already granted.
 * If permission is 'prompt', does nothing - caller should show UI.
 *
 * @returns 'granted' if already set up, 'prompt' if user action needed, 'denied' if blocked
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

		// Don't auto-request on Android 13+ - return status so UI can prompt user
		return permStatus.receive as PushPermissionStatus;
	} catch (error) {
		console.error('[Push] Initialization failed:', error);
		return 'unknown';
	}
}

/**
 * Set up push notification event listeners
 */
function setupPushListeners(): void {
	// Registration success - we get the FCM token here
	PushNotifications.addListener('registration', async (token) => {
		console.log('[Push] Registration successful, token:', token.value.substring(0, 20) + '...');

		// Store token locally for reference
		try {
			localStorage.setItem('fcmToken', token.value);
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
async function registerTokenWithServer(token: string): Promise<void> {
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

		// Clear local storage
		try {
			localStorage.removeItem('fcmToken');
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
