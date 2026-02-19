# DRV-jwl Verification

Task: DRV-jwl
Date: 2026-02-19

## Clause Checklist -> Contract Evidence

- Stable-only prerelease policy via GitHub `releases/latest`: `ralph/plans/MOB-android-update-pipeline.md` (Policy: Stable Releases Only)
- Tag parsing accepts `vX.Y.Z` or `X.Y.Z` only: `ralph/plans/MOB-android-update-pipeline.md` (Policy: Stable Releases Only)
- `versionCode = major*10000 + minor*100 + patch` with constraints: `ralph/plans/MOB-android-update-pipeline.md` (VersionCode Scheme)
- Deterministic APK asset selection priority: `ralph/plans/MOB-android-update-pipeline.md` (Canonical APK Asset Selection)
- `/api/app-version` JSON shape + caching headers: `ralph/plans/MOB-android-update-pipeline.md` (Public API Contract: `GET /api/app-version`)
- `/download` contract and redirect `Cache-Control: no-store`: `ralph/plans/MOB-android-update-pipeline.md` (Download Page Contract: `GET /download`)
- GitHub request headers + timeout + optional token: `ralph/plans/MOB-android-update-pipeline.md` (GitHub API Hardening)
- Fallback to last-known-good else `503` with `Retry-After`: `ralph/plans/MOB-android-update-pipeline.md` (Fallback Behavior)
- CI verifies embedded `versionName` + `versionCode` matches tag: `ralph/plans/MOB-android-update-pipeline.md` (CI / Release Workflow Requirements)

## Deterministic Inventory Query

Command used:

```bash
bd list --all --limit 0 --json | jq -r '.[] | select(.issue_type != "epic") | select(((.title + " " + (.description // "")) | ascii_downcase | test("android update pipeline|release apk|app-version|github release"))) | [.id,.status,((.description // "") | contains("Source: ralph/plans/MOB-android-update-pipeline.md")),.title] | @tsv'
```

Result set reviewed:

- DRV-04g (closed) - source present: true
- DRV-aus (open) - source present: true
- DRV-zbr (closed) - source present: true
- DRV-drp (closed) - source present: true
- DRV-69n (closed) - source present: true
- DRV-jwl (in_progress) - source present: true
- DRV-jfw (open) - source present: true
- DRV-o4e (open) - source present: true
- DRV-2au (open) - source present: true
- DRV-zlc (closed) - source present: true
- DRV-ext (closed) - source present: true

## Updates Performed

- Updated `ralph/plans/MOB-android-update-pipeline.md` wording to make GitHub API version header mandatory and fallback error body shape explicit.
- No bead description updates were required; all inventory beads already referenced `Source: ralph/plans/MOB-android-update-pipeline.md`.
