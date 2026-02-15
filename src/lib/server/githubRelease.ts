type GitHubReleaseAsset = {
	name: string;
	browser_download_url: string;
};

type GitHubReleaseResponse = {
	tag_name: string;
	assets?: GitHubReleaseAsset[];
};

export type LatestAndroidApkRelease = {
	versionName: string;
	versionCode: number;
	downloadUrl: string;
	tagName: string;
	assetName: string;
	source: 'github' | 'cache';
};

export class GitHubReleaseUnavailableError extends Error {
	public readonly name = 'GitHubReleaseUnavailableError';

	constructor(message: string) {
		super(message);
	}
}

const GITHUB_RELEASES_LATEST_URL = 'https://api.github.com/repos/orro3790/drive/releases/latest';

const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

let lastKnownGood: Omit<LatestAndroidApkRelease, 'source'> | null = null;
let lastFetchedAtMs = 0;
let lastEtag: string | null = null;

function nowMs() {
	return Date.now();
}

export function parseStableTagVersion(tagName: string): string {
	const trimmed = tagName.trim();
	const withoutV = trimmed.replace(/^[vV]/, '');
	if (!/^\d+\.\d+\.\d+$/.test(withoutV)) {
		throw new Error(`Unsupported release tag: ${tagName}`);
	}
	return withoutV;
}

export function computeVersionCode(versionName: string): number {
	const [majorStr, minorStr, patchStr] = versionName.split('.');
	const major = Number.parseInt(majorStr, 10);
	const minor = Number.parseInt(minorStr, 10);
	const patch = Number.parseInt(patchStr, 10);

	if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
		throw new Error(`Invalid version: ${versionName}`);
	}

	return major * 10000 + minor * 100 + patch;
}

export function selectAndroidApkAsset(assets: GitHubReleaseAsset[]): GitHubReleaseAsset {
	const apkAssets = assets.filter((asset) => asset.name.toLowerCase().endsWith('.apk'));
	if (apkAssets.length === 0) {
		throw new Error('No .apk assets found on latest GitHub release');
	}

	function priority(name: string): number {
		const lower = name.toLowerCase();
		if (lower.includes('universal')) return 0;
		if (lower.startsWith('drive-v')) return 1;
		if (lower === 'app-release.apk') return 2;
		return 3;
	}

	return apkAssets.slice().sort((a, b) => {
		const pa = priority(a.name);
		const pb = priority(b.name);
		if (pa !== pb) return pa - pb;
		return a.name.localeCompare(b.name);
	})[0];
}

async function fetchLatestReleaseFromGitHub(): Promise<{
	payload: Omit<LatestAndroidApkRelease, 'source'>;
	etag: string | null;
	source: 'github' | 'cache';
}> {
	const token = process.env.GITHUB_TOKEN?.trim();

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

	try {
		const headers: Record<string, string> = {
			Accept: 'application/vnd.github+json',
			'User-Agent': 'drive-app-version-endpoint',
			'X-GitHub-Api-Version': '2022-11-28'
		};

		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		if (lastEtag && lastKnownGood) {
			headers['If-None-Match'] = lastEtag;
		}

		const response = await fetch(GITHUB_RELEASES_LATEST_URL, {
			headers,
			signal: controller.signal
		});

		if (response.status === 304) {
			if (!lastKnownGood) {
				throw new Error('GitHub returned 304 but no cached payload exists');
			}
			return { payload: lastKnownGood, etag: lastEtag, source: 'cache' };
		}

		if (!response.ok) {
			throw new Error(`GitHub release fetch failed: ${response.status} ${response.statusText}`);
		}

		const etag = response.headers.get('etag');
		const json = (await response.json()) as GitHubReleaseResponse;
		const tagName = json.tag_name;
		if (!tagName) {
			throw new Error('GitHub release response missing tag_name');
		}

		const versionName = parseStableTagVersion(tagName);
		const versionCode = computeVersionCode(versionName);

		const assets = json.assets ?? [];
		const asset = selectAndroidApkAsset(assets);
		const expectedTagScope = `/releases/download/${tagName}/`;
		if (!asset.browser_download_url.includes(expectedTagScope)) {
			throw new Error(`Asset URL is not tag-scoped: ${asset.browser_download_url}`);
		}

		return {
			payload: {
				versionName,
				versionCode,
				downloadUrl: asset.browser_download_url,
				tagName,
				assetName: asset.name
			},
			etag,
			source: 'github'
		};
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function getLatestAndroidApkRelease(): Promise<LatestAndroidApkRelease> {
	const ageMs = nowMs() - lastFetchedAtMs;
	if (lastKnownGood && ageMs >= 0 && ageMs < CACHE_TTL_MS) {
		return { ...lastKnownGood, source: 'cache' };
	}

	try {
		const { payload, etag, source } = await fetchLatestReleaseFromGitHub();
		lastKnownGood = payload;
		lastFetchedAtMs = nowMs();
		lastEtag = etag;
		return { ...payload, source };
	} catch (error) {
		if (lastKnownGood) {
			return { ...lastKnownGood, source: 'cache' };
		}

		const message = error instanceof Error ? error.message : 'Unknown error';
		throw new GitHubReleaseUnavailableError(message);
	}
}
