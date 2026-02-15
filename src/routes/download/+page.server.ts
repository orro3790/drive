import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		currentVersion: env.APP_CURRENT_VERSION || '1',
		downloadUrl:
			env.APP_DOWNLOAD_URL ||
			'https://github.com/orro3790/drive/releases/latest/download/app-release.apk'
	};
};
