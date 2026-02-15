import type { PageServerLoad } from './$types';
import { getLatestAndroidApkRelease } from '$lib/server/githubRelease';

export const load: PageServerLoad = async () => {
	try {
		const latest = await getLatestAndroidApkRelease();
		return {
			currentVersion: latest.versionName,
			downloadUrl: latest.downloadUrl
		};
	} catch {
		// Never 500 here: the whole point of /download is to be a reliable
		// escape hatch, even if the GitHub API is rate-limited temporarily.
		return {
			currentVersion: 'latest',
			downloadUrl: 'https://github.com/orro3790/drive/releases/latest'
		};
	}
};
