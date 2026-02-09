# DRV-17l.1: Capacitor Android packaging and private distribution baseline

Task: `DRV-17l.1`
Parent: `DRV-17l`
Status: Drafted for execution

## 1) Goal and scope

Deliver a launch-safe Android baseline for Drive using Capacitor with:

1. Capacitor config + Android native project committed and reproducible.
2. Documented, repeatable sync/build/sign commands.
3. At least one successfully generated signed release artifact.
4. A private distribution path and manager-friendly install/update + rollback SOP.

This plan focuses on Android only (no iOS implementation in this bead).

## 2) Current repository state (already present)

The repo already contains a partial-to-strong baseline from prior checkpoint work:

- Capacitor dependencies and scripts in `package.json`.
- Config in `capacitor.config.ts` with `CAP_SERVER_URL` support.
- Native Android project checked in under `android/`.
- Gradle signing scaffolding in `android/app/build.gradle`.
- Release build helper in `scripts/mobile/android-gradle.mjs`.
- Private distribution SOP doc in `documentation/mobile/android-private-distribution.md`.
- Placeholder web shell in `mobile-shell/index.html`.

Because this exists, execution should prioritize validation, hardening, and evidence capture over re-scaffolding.

## 3) Capacitor findings from Ragnet (what drives this plan)

### 3.1 Workflow and command behavior

- `npx cap sync` = `copy` + `update` (copies built web assets and updates native deps/plugins).
- `npx cap copy` only copies web assets/config to native project.
- `npx cap update` only updates native plugins/dependencies.
- `npx cap run` runs `sync` first unless `--no-sync` is provided.
- `npx cap build android` can output signed `AAB`/`APK` using keystore flags/config.

### 3.2 Native project philosophy

- Capacitor treats native projects as source assets and expects them in version control.
- Most platform behavior must be configured in native files (`AndroidManifest.xml`, Gradle), not only in `capacitor.config.*`.

### 3.3 Config caveats relevant to release safety

- `server.url`, `server.cleartext`, and `server.allowNavigation` are documented as development-oriented and not intended as broad production defaults.
- Android custom schemes are risky after WebView 117; keep default `http`/`https` behavior for routing reliability.
- Plugin permissions often require explicit manifest updates.

### 3.4 Environment and tooling

- Capacitor v8 docs currently call for Node 22+, Android Studio, Android SDK API 24+ (treat as current minimum and verify with doctor).
- `cap doctor` is the quick environment sanity check.

## 4) Technical decisions for this bead

### 4.1 Distribution channel decision

Use **Google Play Closed Testing** as the primary private channel.

Rationale:

- No public listing.
- Driver-friendly install/update through normal Play Store UX.
- Manager control over staged rollout and rapid halt/re-publish.

### 4.2 Web delivery model decision (baseline)

For this baseline bead, keep the existing **hosted web app shell** model:

- `webDir` points to `mobile-shell`.
- runtime URL is injected through `CAP_SERVER_URL` for sync/build.

Rationale:

- Minimal disruption to existing SvelteKit + server-hosted architecture.
- Fastest path to a signed and distributable Android package.

Guardrail:

- Require HTTPS-only production `CAP_SERVER_URL`.
- Treat cleartext as local dev only.

Follow-up (separate bead candidate): evaluate moving to bundled assets/offline strategy if launch requirements demand it.

### 4.3 Signing decision

- Keep keystore material out of git (`android/.gitignore` already covers `keystore.properties` and `keystore/`).
- Use `keystore.properties.example` as template and local/CI secret injection for real values.
- Release tasks must fail when release signing config is missing/invalid (no debug-sign fallback for release).
- Document Play App Signing model explicitly (upload key ownership, custody, and rotation path).

## 5) Implementation plan (detailed)

## Workstream A - Baseline audit and hardening

1. Validate dependency alignment:
   - confirm `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` are same major/minor line.
   - verify scripts in `package.json` call local CLI (`pnpm exec cap ...`).

2. Validate capacitor config intent in `capacitor.config.ts`:
   - `appId` and Android `applicationId` must match.
   - ensure server URL injection is explicit and predictable.
   - enforce HTTPS expectation in release docs/checklist.

3. Validate Android project wiring:
   - release build path fails hard when keystore config is missing/invalid.
   - no debug-only network flags accidentally set for release.

4. Run diagnostics:
   - `pnpm mobile:android:doctor`
   - capture output for bead evidence comment.

Deliverables:

- Hardened/confirmed config files (only if changes needed).
- Evidence note showing doctor and version status.

## Workstream B - Reproducible sync/build pipeline

1. Validate sync flow:
   - set `CAP_SERVER_URL` to staging/prod-like HTTPS URL.
   - run `pnpm mobile:android:sync`.
   - verify `android/app/src/main/assets/capacitor.config.json` reflects expected runtime URL.

2. Validate local Android open/run ergonomics:
   - `pnpm mobile:android:open` for Android Studio workflow.
   - optional `pnpm exec cap run android` smoke run on emulator/device (if available).

3. Pre-build release version gate:
   - confirm `versionCode` and `versionName` strategy before build/upload.
   - update values in `android/app/build.gradle` as part of each release candidate.
   - fail checklist if release artifact would reuse an already-published `versionCode`.

4. Validate release build scripts:
   - `pnpm mobile:android:bundle:release`
   - `pnpm mobile:android:apk:release`
   - confirm wrapper script (`scripts/mobile/android-gradle.mjs`) fails on unsupported tasks, enforces release preflight, and propagates non-zero exits.

Deliverables:

- Confirmed command set for sync/open/release builds.
- Any required script or doc corrections for reproducibility.

## Workstream C - Signed artifact generation and verification

1. Pre-check secrets:
   - confirm `android/keystore.properties` exists locally (or injected in CI).
   - ensure keystore path and alias resolve correctly.

2. Generate artifacts:
   - run bundle and APK release commands.

3. Verify outputs exist:
   - `android/app/build/outputs/bundle/release/app-release.aab`
   - `android/app/build/outputs/apk/release/app-release.apk`
   - verify signing identity/fingerprint and record expected cert match.
   - capture artifact SHA256 for traceability.

4. Record evidence:
   - keep artifact binaries out of git.
   - add bead comment with timestamp + command + success confirmation.
   - use a consistent evidence template:
     - timestamp,
     - command run,
     - artifact path,
     - artifact SHA256,
     - signer fingerprint/alias.

Deliverables:

- At least one signed release artifact generated successfully.
- Traceable evidence in bead comment/log.

## Workstream D - Private distribution SOP hardening

1. Expand/validate `documentation/mobile/android-private-distribution.md`:
   - prerequisites for managers (Play Console access, Google Group strategy, package ID consistency).
   - exact upload path to Closed Testing track.
   - driver onboarding steps with plain-language instructions.

2. Add release operations details:
   - release notes template (manager copy/paste format).
   - rollout sequencing (pilot cohort -> broader cohort).
   - first-install verification checklist (first 3 installs).

3. Add rollback procedure clarity:
   - halt rollout.
   - publish hotfix with a higher `versionCode` (or promote pre-staged fallback artifact with higher code).
   - do not depend on downgrading users to a lower `versionCode`.
   - communication template for managers/drivers.
   - incident logging fields.

Deliverables:

- Manager-friendly SOP that can be followed without Android tooling knowledge.

## Workstream E - Security and operations guardrails

1. Secret hygiene checks:
   - verify no keystore passwords in tracked files.
   - verify keystore files and local signing props remain gitignored.

2. Runtime safety checks:
   - confirm release docs require HTTPS `CAP_SERVER_URL`.
   - enforce HTTPS-only `CAP_SERVER_URL` for release tasks in build preflight.
   - explicitly prohibit broad `allowNavigation` usage unless justified.

3. Android backup/export hardening check:
   - explicitly review manifest posture for backup/export behavior in release (`allowBackup` and related backup rules).

Deliverables:

- Security notes and release guardrails captured in docs/checklist.

## Workstream F - Bead completion workflow

1. Map final state to acceptance criteria (explicit checklist).
2. Add bead comments linking:
   - successful build evidence,
   - SOP doc path,
   - any caveats/follow-up beads.
3. Close bead when all criteria are met.

## 6) Acceptance criteria mapping

### AC1: Capacitor config and Android project are committed

- Verify `capacitor.config.ts`, `android/` project files tracked as intended.
- Ensure generated/ephemeral files stay ignored.

### AC2: Build and sync commands are documented and reproducible

- Commands exist in `package.json` scripts.
- Steps documented in `documentation/mobile/android-private-distribution.md`.
- Fresh operator can run doctor -> sync -> build with only prerequisite setup.

### AC3: Signed release artifact generated successfully

- Run release build command(s) successfully.
- Confirm artifact path(s) and produce bead evidence entry.

### AC4: Private distribution path and manager SOP + rollback documented

- Closed Testing process documented end-to-end.
- Manager install/update workflow and rollback communications included.

### Go/No-Go sign-off checklist

- AC1 evidence: tracked file list + ignore check for generated/native transient files.
- AC2 evidence: successful command transcript for doctor/sync/build path.
- AC3 evidence: artifact path + SHA256 + signing fingerprint in bead comment.
- AC4 evidence: SOP doc link + manager rollout/rollback communication template.

## 7) Validation commands (execution checklist)

```bash
pnpm install
pnpm mobile:android:doctor

# one-time signing setup (PowerShell)
New-Item -ItemType Directory -Force android/keystore
Copy-Item android/keystore.properties.example android/keystore.properties

# one-time signing setup (bash)
mkdir -p android/keystore
cp android/keystore.properties.example android/keystore.properties

# set runtime host URL (PowerShell example)
$env:CAP_SERVER_URL="https://<drive-host>"

# pre-build release version checks (versionCode/versionName)
# file to update: android/app/build.gradle
# ensure versionCode is incremented for every Play upload

pnpm mobile:android:sync
pnpm mobile:android:bundle:release
pnpm mobile:android:apk:release
```

Optional smoke check:

- Minimum matrix for baseline confidence: 1 Android emulator/device on API 24+ and 1 current API-level emulator/device.

```bash
pnpm exec cap run android
```

## 8) Risks and mitigations

1. **Risk:** `CAP_SERVER_URL` misconfigured or non-HTTPS.
   - **Mitigation:** enforce HTTPS in docs and pre-release checklist; fail review if missing.

2. **Risk:** signing material missing on build machine.
   - **Mitigation:** explicit keystore setup step + example template + CI secret policy.

3. **Risk:** Play rollout issues after release.
   - **Mitigation:** staged Closed Testing rollout and rollback-by-hotfix (higher `versionCode`), not downgrade.

4. **Risk:** architecture debt from hosted shell model.
   - **Mitigation:** file follow-up bead for packaged/offline-capable shell evaluation.

## 9) Out of scope for DRV-17l.1

- iOS build/sign/distribution.
- Full offline-first mobile behavior.
- Deep native feature rollout beyond baseline packaging/distribution.
- Appflow/CI automation beyond baseline local reproducibility.

## 10) Follow-up bead recommendations

1. Add CI-based Android release build verification (non-secret-safe artifact metadata only).
2. Add explicit versionCode/versionName bump workflow tooling.
3. Evaluate migration from hosted shell to bundled assets (if launch requirements change).
