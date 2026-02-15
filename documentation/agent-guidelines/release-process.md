# Release Process

How releases work in Drive. Read this before attempting any release or APK build.

## Automated Release Flow

Releases are fully automated via GitHub Actions:

1. **Push to main** → `release-please.yml` creates/updates a "Release PR"
2. **Merge the Release PR** → release-please creates a GitHub Release with tag
3. **Release published** → `android-release.yml` builds and attaches APK

**You do NOT need to:**

- Manually trigger workflows
- Manually create releases
- Manually build APKs for distribution

Just push to main and merge the Release PR when ready.

## Android APK Distribution

APKs are distributed via the `/download` page, which pulls from GitHub Releases.

### Build Artifacts

| Artifact | Path                                                       | Purpose              |
| -------- | ---------------------------------------------------------- | -------------------- |
| APK      | `android/app/build/outputs/apk/release/app-release.apk`    | Side-load to devices |
| AAB      | `android/app/build/outputs/bundle/release/app-release.aab` | Play Store (future)  |

### Local Development Builds (Windows)

**IMPORTANT: Use WSL for Android builds on Windows.**

Gradle 8.13+ has a [known bug](https://github.com/gradle/gradle/issues/31438) on Windows where transform cache renames fail. The only reliable workaround is building from WSL.

#### Prerequisites (one-time WSL setup)

```bash
# Install Java 21
sudo apt update && sudo apt install -y openjdk-21-jdk unzip

# Download Android command-line tools
mkdir -p ~/Android/Sdk/cmdline-tools
cd ~/Android/Sdk/cmdline-tools
curl -o tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip tools.zip && mv cmdline-tools latest && rm tools.zip

# Add to ~/.bashrc
echo 'export ANDROID_HOME=~/Android/Sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc

# Install SDK components
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

#### Building locally

1. **From Windows (Git Bash/PowerShell):** Sync Capacitor first

   ```bash
   pnpm mobile:android:sync
   ```

2. **From WSL:** Build the APK
   ```bash
   source ~/.bashrc
   export CAP_SERVER_URL="https://drive-three-psi.vercel.app"
   cd /mnt/c/Users/matto/projects/drive/android
   ./gradlew assembleRelease --no-daemon --max-workers=1
   ```

### Versioning

- `versionCode` and `versionName` in `android/app/build.gradle`
- GitHub Actions auto-updates these from release tags (e.g., `v1.2.3` → versionCode `10203`)
- For local testing, version doesn't matter

## Capacitor Shell Architecture

The Android app is a **Capacitor shell** that loads the web app from Vercel:

- **Web changes**: Auto-deploy via Vercel. No new APK needed.
- **Native changes**: Require new APK (push notifications, native plugins, etc.)

Users only need to download a new APK when native code changes.

## Firebase / Push Notifications

Push notifications require:

1. `@capacitor/push-notifications` plugin installed
2. `google-services.json` in `android/app/`
3. Firebase Admin SDK credentials in `.env` (server-side)

See `documentation/testing/push-notification-checklist.md` for testing all notification types.
