/**
 * App Version Utilities
 *
 * Client-side utilities for checking app version against server requirements.
 * Used by AppVersionGate to block outdated native apps.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export interface VersionInfo {
	minVersion: number;
	currentVersion: number;
	downloadUrl: string;
}

export type VersionCheckState =
	| { status: 'checking' }
	| { status: 'browser' }
	| { status: 'allowed'; appVersion: number; serverInfo: VersionInfo }
	| { status: 'outdated'; appVersion: number; serverInfo: VersionInfo }
	| { status: 'error'; message: string };

/**
 * Get the app's versionCode from the native layer.
 * Returns null if running in browser (not Capacitor native).
 */
export async function getAppVersion(): Promise<number | null> {
	if (!Capacitor.isNativePlatform()) {
		return null;
	}

	const info = await App.getInfo();
	return parseInt(info.build, 10);
}

/**
 * Fetch version requirements from server.
 */
export async function fetchVersionInfo(): Promise<VersionInfo> {
	const response = await fetch('/api/app-version');
	if (!response.ok) {
		throw new Error(`Failed to fetch version info: ${response.status}`);
	}
	return response.json();
}

/**
 * Check if the current app version meets server requirements.
 * Returns the full state for UI rendering.
 */
export async function checkVersion(): Promise<VersionCheckState> {
	// Browser users pass through immediately
	const appVersion = await getAppVersion();
	if (appVersion === null) {
		return { status: 'browser' };
	}

	try {
		const serverInfo = await fetchVersionInfo();

		if (appVersion < serverInfo.minVersion) {
			return { status: 'outdated', appVersion, serverInfo };
		}

		return { status: 'allowed', appVersion, serverInfo };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Connection error';
		return { status: 'error', message };
	}
}
