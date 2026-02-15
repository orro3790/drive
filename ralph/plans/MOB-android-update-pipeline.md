## Android Update Pipeline (Automated)

### Goal

Make Android app updates fully automated end-to-end:

- GitHub Actions builds and uploads the release APK to GitHub Releases.
- The web app resolves the latest APK + versionCode automatically from GitHub Releases.
- No manual renaming, no manual uploading, and no manual Vercel env updates per release.

This removes the recurring failure mode where users repeatedly install an old APK (e.g. Android shows "Version 1") because the download link (or cached redirect) points at stale content.

### Non-Goals

- Changing notification permission UX, FCM configuration, or app icon behavior directly.
- Supporting prerelease channels.

### Policy: Stable Releases Only

- The updater must ignore prereleases.
- Use GitHub API `releases/latest` which returns the latest non-prerelease, non-draft release.
- Tags must be stable semver: `vX.Y.Z` or `X.Y.Z`.

### VersionCode Scheme

Compute Android `versionCode` from the tag:

- `versionCode = major * 10000 + minor * 100 + patch`
- Example: `1.1.6 -> 10106`

Constraints (documented): assumes `minor < 100` and `patch < 100`.

### Canonical APK Asset Selection

The web app must pick a deterministic, installable APK asset from a GitHub Release.

If multiple `.apk` assets exist, select using this priority order:

1. Name contains `universal` (preferred)
2. Name starts with `drive-v` (versioned asset)
3. Name equals `app-release.apk` (legacy)
4. Otherwise: lexicographically smallest `.apk` name

The returned download URL must be the immutable, tag-scoped URL:

- Use `asset.browser_download_url` from the GitHub API response.
- Do not return `.../releases/latest/...` links from the API.

### Public API Contract: `GET /api/app-version`

Response JSON:

```json
{
	"minVersion": 10100,
	"currentVersion": 10106,
	"downloadUrl": "https://github.com/.../releases/download/v1.1.6/drive-v1.1.6.apk"
}
```

- `minVersion` is manually controlled by `APP_MIN_VERSION` (Vercel env var) to force updates only when desired.
- `currentVersion` and `downloadUrl` are always resolved from GitHub Releases.

Caching:

- `Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=3600`

### Download Page Contract: `GET /download`

- Must render the same tag-scoped `downloadUrl` as `/api/app-version`.
- Must not require per-release env changes.

If implemented as a redirect, the redirect response must be non-cacheable:

- `Cache-Control: no-store`

### GitHub API Hardening

Requests to GitHub must:

- Set headers:
  - `Accept: application/vnd.github+json`
  - `User-Agent: drive-app-version-endpoint`
  - `X-GitHub-Api-Version: 2022-11-28` (recommended)
- Use `Authorization: Bearer <token>` when `GITHUB_TOKEN` is present on the server.
- Use an explicit timeout (AbortController), e.g. 5-10 seconds.

### Fallback Behavior

When GitHub API calls fail (network, 403 rate limit, 5xx):

- Prefer returning the last-known-good resolved payload from an in-memory cache.
- If no cached payload exists, return HTTP 503 with `Retry-After: 60` and a JSON body that AppVersionGate can treat as a connectivity problem.

### CI / Release Workflow Requirements

To prevent regressions where the shipped APK still reports "version 1":

- Release workflows must:
  - Produce a versioned APK filename automatically, e.g. `drive-v1.1.6.apk`
  - Upload it as a release asset.
- Add a workflow gate after building the APK to assert:
  - Embedded `versionName` equals the tag version (e.g. 1.1.6)
  - Embedded `versionCode` equals the computed code (e.g. 10106)

Implementation note: use `aapt dump badging <apk>` on the GitHub Actions runner.

### One-Time Vercel Configuration

- Keep: `APP_MIN_VERSION` (manual)
- Add (recommended): `GITHUB_TOKEN` (read-only access is sufficient for public repos; prevents API rate limiting)
- Remove/ignore: `APP_CURRENT_VERSION`, `APP_DOWNLOAD_URL` (no longer used)
