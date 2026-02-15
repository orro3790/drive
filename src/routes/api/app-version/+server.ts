/**
 * App Version API - Mobile App Version Check
 *
 * GET /api/app-version - Returns version info for mobile app update checks:
 * - minVersion: Minimum required versionCode (blocks older apps)
 * - currentVersion: Latest available versionCode
 * - downloadUrl: URL to download latest APK
 *
 * This is a PUBLIC endpoint (no auth required) - must be accessible
 * before login to block outdated apps.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
	const minVersion = parseInt(env.APP_MIN_VERSION || '1', 10);
	const currentVersion = parseInt(env.APP_CURRENT_VERSION || '1', 10);
	const downloadUrl =
		env.APP_DOWNLOAD_URL ||
		'https://github.com/orro3790/drive/releases/latest/download/app-release.apk';

	return json({
		minVersion,
		currentVersion,
		downloadUrl
	});
};
