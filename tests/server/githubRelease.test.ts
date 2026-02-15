import { describe, expect, it, vi, afterEach } from 'vitest';

type MockResponse = {
	status: number;
	ok: boolean;
	statusText: string;
	headers: { get: (key: string) => string | null };
	json: () => Promise<unknown>;
};

function makeMockResponse(options: {
	status: number;
	json?: unknown;
	headers?: Record<string, string>;
}): MockResponse {
	const normalizedHeaders: Record<string, string> = {};
	for (const [key, value] of Object.entries(options.headers ?? {})) {
		normalizedHeaders[key.toLowerCase()] = value;
	}

	return {
		status: options.status,
		ok: options.status >= 200 && options.status < 300,
		statusText: options.status === 200 ? 'OK' : '',
		headers: {
			get: (key: string) => normalizedHeaders[key.toLowerCase()] ?? null
		},
		json: async () => options.json
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('githubRelease helpers', () => {
	it('parses stable semver tags and computes versionCode', async () => {
		const { parseStableTagVersion, computeVersionCode } =
			await import('../../src/lib/server/githubRelease');

		expect(parseStableTagVersion('v1.2.3')).toBe('1.2.3');
		expect(parseStableTagVersion('1.2.3')).toBe('1.2.3');
		expect(computeVersionCode('1.2.3')).toBe(10203);

		expect(() => parseStableTagVersion('v1.2.3-alpha.1')).toThrow();
	});

	it('selects .apk assets deterministically by priority', async () => {
		const { selectAndroidApkAsset } = await import('../../src/lib/server/githubRelease');

		const assets = [
			{ name: 'drive-v1.2.3-arm64.apk', browser_download_url: 'https://example/arm64.apk' },
			{
				name: 'drive-v1.2.3-universal.apk',
				browser_download_url: 'https://example/universal.apk'
			},
			{ name: 'app-release.apk', browser_download_url: 'https://example/app-release.apk' },
			{ name: 'readme.txt', browser_download_url: 'https://example/readme.txt' }
		];

		expect(selectAndroidApkAsset(assets).name).toBe('drive-v1.2.3-universal.apk');
	});

	it('falls back to app-release.apk when no universal/drive-v match', async () => {
		const { selectAndroidApkAsset } = await import('../../src/lib/server/githubRelease');

		const assets = [
			{ name: 'notes.md', browser_download_url: 'https://example/notes.md' },
			{ name: 'app-release.apk', browser_download_url: 'https://example/app-release.apk' },
			{ name: 'zzz.apk', browser_download_url: 'https://example/zzz.apk' }
		];

		expect(selectAndroidApkAsset(assets).name).toBe('app-release.apk');
	});

	it('falls back to lexicographically smallest .apk name', async () => {
		const { selectAndroidApkAsset } = await import('../../src/lib/server/githubRelease');

		const assets = [
			{ name: 'b.apk', browser_download_url: 'https://example/b.apk' },
			{ name: 'a.apk', browser_download_url: 'https://example/a.apk' }
		];

		expect(selectAndroidApkAsset(assets).name).toBe('a.apk');
	});

	it('throws when no .apk assets exist', async () => {
		const { selectAndroidApkAsset } = await import('../../src/lib/server/githubRelease');
		expect(() =>
			selectAndroidApkAsset([{ name: 'readme.txt', browser_download_url: 'x' }])
		).toThrow();
	});
});

describe('getLatestAndroidApkRelease caching/fallback', () => {
	it('returns cached payload on fetch failure after lastKnownGood exists', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

		vi.resetModules();

		const releaseJson = {
			tag_name: 'v1.2.3',
			assets: [
				{
					name: 'drive-v1.2.3-universal.apk',
					browser_download_url:
						'https://github.com/orro3790/drive/releases/download/v1.2.3/drive-v1.2.3-universal.apk'
				}
			]
		};

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				makeMockResponse({
					status: 200,
					json: releaseJson,
					headers: { etag: '"etag-1"' }
				})
			)
			.mockRejectedValueOnce(new Error('network down'));

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const { getLatestAndroidApkRelease } = await import('../../src/lib/server/githubRelease');
		const first = await getLatestAndroidApkRelease();
		expect(first.source).toBe('github');

		vi.setSystemTime(new Date('2026-01-01T00:20:00.000Z'));
		const second = await getLatestAndroidApkRelease();
		expect(second.source).toBe('cache');
		expect(second.downloadUrl).toBe(first.downloadUrl);
	});

	it('uses If-None-Match and returns cached payload on 304', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

		vi.resetModules();

		const releaseJson = {
			tag_name: 'v1.2.3',
			assets: [
				{
					name: 'drive-v1.2.3-universal.apk',
					browser_download_url:
						'https://github.com/orro3790/drive/releases/download/v1.2.3/drive-v1.2.3-universal.apk'
				}
			]
		};

		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				makeMockResponse({
					status: 200,
					json: releaseJson,
					headers: { etag: '"etag-2"' }
				})
			)
			.mockResolvedValueOnce(makeMockResponse({ status: 304 }));

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const { getLatestAndroidApkRelease } = await import('../../src/lib/server/githubRelease');
		await getLatestAndroidApkRelease();

		vi.setSystemTime(new Date('2026-01-01T00:20:00.000Z'));
		const second = await getLatestAndroidApkRelease();
		expect(second.source).toBe('cache');

		const secondCallOptions = fetchMock.mock.calls[1]?.[1] as { headers?: Record<string, string> };
		expect(secondCallOptions.headers?.['If-None-Match']).toBe('"etag-2"');
	});
});
