# Spec: Android update pipeline contract

Task: DRV-jwl

## Steps

1. Pull the canonical requirements from `bd show DRV-jwl` and convert them into a clause checklist (prerelease policy, tag parsing, versionCode formula, asset selection, `/api/app-version`, `/download`, GitHub request behavior, fallback behavior, CI parity check).
2. Update `ralph/plans/MOB-android-update-pipeline.md` to cover every checklist clause with explicit rules, defaults, and failure behavior that can be validated by reviewers.
3. Build a deterministic implementation-bead inventory using `bd list --all --limit 0 --json`: include every non-epic issue whose title or description mentions one or more of `android update pipeline`, `release apk`, `app-version`, or `github release`.
4. For each inventory bead, ensure the description contains exactly `Source: ralph/plans/MOB-android-update-pipeline.md`; update missing references in-place with `bd update <id> --description`.
5. Create `ralph/plans/DRV-jwl-verification.md` containing (a) checklist-to-doc mapping, (b) bead IDs reviewed/updated, and (c) commands/output snippets used for verification.

## Acceptance Criteria

- `ralph/plans/MOB-android-update-pipeline.md` explicitly defines all required clauses: stable-only prerelease policy, tag parsing rules, versionCode formula and constraints, deterministic asset selection, `/api/app-version` response contract and caching, `/download` redirect/cache behavior, GitHub headers/timeout/token behavior, fallback to last-known-good then `503` with `Retry-After`, and CI parity check for embedded `versionName`/`versionCode`.
- `ralph/plans/DRV-jwl-verification.md` exists with a clause checklist and evidence mapping for each clause.
- Every bead in the deterministic inventory includes `Source: ralph/plans/MOB-android-update-pipeline.md` in its description.
