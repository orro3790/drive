# Android private distribution baseline

This guide defines the launch-safe Android packaging and private distribution baseline for Drive using Capacitor.

## Chosen private distribution path

Use **Google Play Console Closed Testing** as the primary channel.

- No public listing.
- Drivers install and update through normal Play Store UX.
- Managers can stage rollout, pause quickly, and recover using hotfix promotion.

## Security and release guardrails

- Release builds require `CAP_SERVER_URL` and it must start with `https://`.
- Cleartext (`http://`) runtime URLs are dev-only and must never be used for release artifacts.
- Do not set broad `allowNavigation` values unless a documented exception is approved.
- Keep signing material out of git (`android/keystore.properties` and `android/keystore/` are ignored).
- Android manifest release posture is hardened with `android:allowBackup="false"`.

## Prerequisites

- Node.js 22+ (Capacitor v8 baseline)
- Java 21
- Android Studio + Android SDK API 24+
- Google Play Console app entry with package ID `com.orro.drive`
- Hosted Drive runtime URL for WebView (`CAP_SERVER_URL`, HTTPS)

## One-time signing setup

1. Create a keystore directory:

```bash
# PowerShell
New-Item -ItemType Directory -Force android/keystore

# bash/zsh
mkdir -p android/keystore
```

2. Generate a release keystore:

```bash
keytool -genkeypair -v -keystore android/keystore/drive-release.jks -alias drive-release -keyalg RSA -keysize 2048 -validity 3650
```

3. Create local signing properties:

```bash
# PowerShell
Copy-Item android/keystore.properties.example android/keystore.properties

# bash/zsh
cp android/keystore.properties.example android/keystore.properties
```

4. Edit `android/keystore.properties` with real values.

5. Confirm key custody expectations:

- **Play App Signing key**: managed by Google after enrollment.
- **Upload key**: owned by Drive team; required for every upload.
- Store upload keystore/passwords in approved secret manager only.
- If upload key is lost/compromised, escalate to engineering manager + security lead and start Play upload key reset process.

## Reproducible command workflow

1. Verify environment:

```bash
pnpm mobile:android:doctor
```

2. Set runtime URL:

```bash
# PowerShell
$env:CAP_SERVER_URL="https://drive.example.com"

# bash/zsh
export CAP_SERVER_URL="https://drive.example.com"
```

3. Sync Capacitor project:

```bash
pnpm mobile:android:sync
```

4. Build release artifacts:

```bash
pnpm mobile:android:bundle:release
pnpm mobile:android:apk:release
```

5. Optional Android Studio workflow:

```bash
pnpm mobile:android:open
```

Release artifacts:

- `android/app/build/outputs/bundle/release/app-release.aab`
- `android/app/build/outputs/apk/release/app-release.apk`

### Release preflight behavior (enforced)

`mobile:android:bundle:release` and `mobile:android:apk:release` fail fast when:

- `CAP_SERVER_URL` is missing.
- `CAP_SERVER_URL` is not HTTPS.
- `android/keystore.properties` is missing.
- Required signing fields are missing or still placeholder values.
- Configured keystore file path does not exist.

### Windows build: use WSL (required)

Gradle 8.13+ has a [known bug on Windows](https://github.com/gradle/gradle/issues/31438) where transform cache file renames fail ("could not move temporary workspace to immutable location"). This affects all Windows shells (cmd, PowerShell, Git Bash) and persists even after cache wipes or antivirus exclusions.

**The reliable workaround is to build from WSL (Windows Subsystem for Linux).**

#### One-time WSL setup

1. Install Java 21 and the Android SDK:

```bash
# Java
sudo apt install openjdk-21-jdk-headless unzip -y

# Android command-line tools
cd ~
curl -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip cmdline-tools.zip
mkdir -p ~/android-sdk/cmdline-tools
mv cmdline-tools ~/android-sdk/cmdline-tools/latest

# Install SDK components
export ANDROID_HOME=~/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses
sdkmanager "build-tools;35.0.0" "platforms;android-35"
```

2. Optionally add to `~/.bashrc` so you don't have to export every time:

```bash
echo 'export ANDROID_HOME=~/android-sdk' >> ~/.bashrc
echo 'export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH' >> ~/.bashrc
```

#### Building release artifacts from WSL

```bash
export ANDROID_HOME=~/android-sdk
export CAP_SERVER_URL="https://drive-three-psi.vercel.app"
cd /mnt/c/Users/matto/projects/drive/android
./gradlew bundleRelease assembleRelease --no-daemon --max-workers=1
```

This builds both artifacts in one command:

- **AAB** → `android/app/build/outputs/bundle/release/app-release.aab` (upload to Play Console)
- **APK** → `android/app/build/outputs/apk/release/app-release.apk` (side-load to phone)

**Important**: Run `pnpm mobile:android:sync` from Windows (Git Bash / PowerShell) before building in WSL, since pnpm/Node runs on the Windows side.

#### Legacy workaround (insufficient)

The flags below were the original mitigation but do not reliably fix the Gradle 8.14.3 bug:

```bash
GRADLE_USER_HOME="$PWD/.gradle-home" CAP_GRADLE_MAX_WORKERS=1 pnpm mobile:android:bundle:release
```

`CAP_GRADLE_MAX_WORKERS` is supported by `scripts/mobile/android-gradle.mjs` and must be a positive integer.

## Versioning responsibility

- `versionCode` and `versionName` live in `android/app/build.gradle`.
- Increase `versionCode` for every Play upload (required by Play).
- Do not attempt rollback via lower `versionCode`; Play blocks downgrade paths.

## Manager SOP (non-technical)

### Upload and release flow (Closed Testing)

1. Open Play Console -> App -> Testing -> Closed testing.
2. Create or select the active closed track (for example `drivers-pilot`).
3. Upload latest `app-release.aab`.
4. Add release notes using the template below.
5. Review and start rollout to selected tester group.
6. Confirm Play status becomes available for testers.

### Tester onboarding and install path

1. Add drivers to the tester Google Group.
2. Share opt-in link for the closed track.
3. Driver taps opt-in link -> joins test -> opens Play Store listing.
4. Driver installs or updates Drive from Play Store.

### First-3-install verification checklist

For the first three drivers on each release:

1. Confirm install/update completes from Play Store.
2. Confirm app launches without crash.
3. Confirm sign-in works.
4. Confirm dashboard data loads over production HTTPS host.
5. Log pass/fail and timestamp in release log.

### Manager release note template

Use this message in Play release notes and team chat:

```text
Drive Android update - <YYYY-MM-DD>

What changed:
- <bullet 1>
- <bullet 2>

Who should update:
- All closed-test drivers

Timing:
- Rollout starts: <time zone + time>
- Expected completion: <time>

If you see issues:
- Keep Drive open and report in #ops-mobile with screenshot + time.
```

## Rollback playbook (rollback by hotfix)

If a bad release is detected:

1. Halt closed-test rollout immediately in Play Console.
2. Prepare hotfix build with a **higher** `versionCode` than the bad release.
3. Upload hotfix AAB to same closed track and publish with incident note.
4. Ask drivers to update from Play Store once hotfix is live.
5. Confirm recovery on first three updated drivers.

Important constraints:

- Do not rely on downgrading to a lower `versionCode`.
- Do not side-load rollback APKs as a standard recovery path.

### Rollback communication template

```text
Drive Android notice - temporary issue identified

We paused the current rollout and are publishing a fixed update now.
Please keep your current app installed and update from Play Store when prompted.

Next update at: <time>
```

### Incident log fields

- Release version (`versionName` + `versionCode`)
- Detection timestamp
- Impact summary
- Rollout halt timestamp
- Hotfix version and publish timestamp
- Driver confirmation timestamp (first 3 verified)
- Owner and follow-up actions

## Evidence checklist for launch review

- `pnpm mobile:android:doctor` output recorded
- Sync/build command transcript recorded
- Artifact paths + SHA256 values recorded
- Signing verification output recorded
- Closed Testing SOP and rollback communication attached
