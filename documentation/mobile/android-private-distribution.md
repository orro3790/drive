# Android private distribution baseline

This guide defines the baseline Android packaging flow for Drive using Capacitor and a private (non-public) distribution model.

## Chosen private distribution path

Use **Google Play Console Closed Testing** as the default channel.

- Drivers install from an invite link (no public listing).
- Updates are handled by Play Store (no side-loading retraining).
- Managers can stage rollouts and roll back quickly.

## Prerequisites

- Java 21
- Android SDK (platform tools + build tools)
- Google Play Console app entry (same package ID as `capacitor.config.ts`)
- Hosted Drive web URL for mobile webview (`CAP_SERVER_URL`)

## One-time setup

1. Generate a release keystore (run once):

```bash
keytool -genkeypair -v -keystore android/keystore/drive-release.jks -alias drive-release -keyalg RSA -keysize 2048 -validity 3650
```

2. Create signing properties:

```bash
cp android/keystore.properties.example android/keystore.properties
```

3. Edit `android/keystore.properties` with real values.

## Build and sync workflow

Set the hosted app URL before sync/build:

```bash
# PowerShell
$env:CAP_SERVER_URL="https://drive.example.com"

# bash/zsh
export CAP_SERVER_URL="https://drive.example.com"
```

Core commands:

```bash
pnpm mobile:android:sync            # sync Capacitor config + plugins
pnpm mobile:android:open            # open Android Studio project
pnpm mobile:android:bundle:release  # build signed AAB for Play Console
pnpm mobile:android:apk:release     # build signed APK (fallback/testing)
```

Release artifacts:

- `android/app/build/outputs/bundle/release/app-release.aab`
- `android/app/build/outputs/apk/release/app-release.apk`

## Manager SOP (non-technical)

1. Upload new `app-release.aab` to **Closed testing** track.
2. Add testers via Google Group (drivers use company Google accounts).
3. Publish release notes in plain language (what changed + ETA).
4. Share the closed-test opt-in link once per driver.
5. Confirm first 3 installs complete, then message all drivers.

Driver install/update experience:

- First install: open invite link -> accept test -> install from Play Store.
- Updates: Play Store auto-updates in the background.

## Rollback notes

If a bad release ships:

1. Halt rollout in Closed Testing.
2. Promote previous known-good bundle (or re-enable prior release).
3. Send manager message: "Pause update and keep current app open until rollback finishes."
4. Record incident details in the launch log with release version and timestamp.
