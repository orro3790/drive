import type { PageServerLoad } from './$types';
import { getLatestAndroidApkRelease } from '$lib/server/githubRelease';

export const load: PageServerLoad = async () => {
	const latest = await getLatestAndroidApkRelease();
	return {
		currentVersion: latest.versionName,
		downloadUrl: latest.downloadUrl
	};
};
