/**
 * Push Notification Initialization
 *
 * Handles Capacitor push notification setup on native platforms.
 * - Requests notification permission
 * - Registers for push notifications
 * - Sends FCM token to server
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

/**
 * Check if we're running in a native Capacitor environment
 */
export function isNativePlatform(): boolean {
	return Capacitor.isNativePlatform();
}

/**
 * Initialize push notifications on native platforms.
 * Safe to call on web - will no-op.
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initPushNotifications(): Promise<void> {
	// Only run on native platforms
	if (!isNativePlatform()) {
		console.log('[Push] Skipping - not a native platform');
		return;
	}

	try {
		// Check current permission status
		const permStatus = await PushNotifications.checkPermissions();
		console.log('[Push] Current permission status:', permStatus.receive);

		// Request permission if not granted
		if (permStatus.receive !== 'granted') {
			const requestResult = await PushNotifications.requestPermissions();
			console.log('[Push] Permission request result:', requestResult.receive);

			if (requestResult.receive !== 'granted') {
				console.warn('[Push] Permission denied by user');
				return;
			}
		}

		// Set up event listeners before registering
		setupPushListeners();

		// Register with FCM
		await PushNotifications.register();
		console.log('[Push] Registration initiated');
	} catch (error) {
		console.error('[Push] Initialization failed:', error);
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
