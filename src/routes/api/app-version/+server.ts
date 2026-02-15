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
import { getLatestAndroidApkRelease } from '$lib/server/githubRelease';

export const GET: RequestHandler = async () => {
	const parsedMinVersion = Number.parseInt(env.APP_MIN_VERSION ?? '0', 10);
	const minVersion =
		Number.isFinite(parsedMinVersion) && parsedMinVersion > 0 ? parsedMinVersion : 0;

	try {
		const latest = await getLatestAndroidApkRelease();
		return json(
			{
				minVersion,
				currentVersion: latest.versionCode,
				downloadUrl: latest.downloadUrl
			},
			{
				headers: {
					'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600',
					'X-Drive-AppVersion-Source': latest.source
				}
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unable to resolve latest app version';
		return json(
			{ message },
			{
				status: 503,
				headers: {
					'Cache-Control': 'no-store',
					'Retry-After': '60',
					'X-Drive-AppVersion-Source': 'error'
				}
			}
		);
	}
};
