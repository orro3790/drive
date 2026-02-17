---
name: mobile-debug
description: Mobile app debugging workflow with ADB screenshots and rapid iteration. Use when debugging UI/UX on Android with the user.
---

# Mobile Debug Workflow

Debug the Android app in tandem with the user. Take screenshots automatically to verify fixes rather than assuming they work.

## Prerequisites

- Android Studio installed (provides Android SDK)
- Phone connected via USB with USB debugging enabled
- ADB available at `$LOCALAPPDATA/Android/Sdk/platform-tools`

## Screenshot Workflow

**IMPORTANT**: Do NOT pipe `screencap` output directly - it corrupts on Windows. Save to device first, then pull.

### Take Screenshot

```bash
export PATH="$PATH:$LOCALAPPDATA/Android/Sdk/platform-tools"
adb shell screencap -p //sdcard//screenshot.png
adb pull //sdcard//screenshot.png C:/Users/matto/projects/drive/.mobile-debug/screenshot.png
adb shell rm //sdcard//screenshot.png
```

Then read the screenshot:

```
Read(.mobile-debug/screenshot.png)
```

### Multiple Screenshots

For comparing before/after, use descriptive names:

```bash
adb pull //sdcard//screenshot.png C:/Users/matto/projects/drive/.mobile-debug/before-fix.png
# ... make changes and rebuild ...
adb pull //sdcard//screenshot.png C:/Users/matto/projects/drive/.mobile-debug/after-fix.png
```

## Build and Install

### Quick Rebuild (after code changes)

```bash
# Sync web assets + native code
cd /c/Users/matto/projects/drive
CAP_SERVER_URL="https://drive-three-psi.vercel.app" npx cap sync android

# Build and install
cd android && ./gradlew installDebug
```

### Full Rebuild (after Gradle/config changes)

```bash
cd /c/Users/matto/projects/drive/android
./gradlew clean installDebug
```

## Debug Iteration Loop

1. **Take screenshot** to see current state
2. **Identify issue** with user
3. **Make fix** in code
4. **Sync and rebuild**: `npx cap sync android && cd android && ./gradlew installDebug`
5. **Take screenshot** to verify fix
6. **Repeat** until user is satisfied

## Common Issues

### Version Downgrade Error

```
INSTALL_FAILED_VERSION_DOWNGRADE
```

**Fix**: Uninstall first, then install:

```bash
./gradlew uninstallAll installDebug
```

Or bump version in `android/app/build.gradle`:

```gradle
versionCode 99999  // Higher than any prod version
```

### App Shows "Update Required"

Debug builds have low version codes. Set `versionCode 99999` in build.gradle for testing.

### "Set CAP_SERVER_URL" Message

The app needs to know where to load web content from. Always sync with the URL:

```bash
CAP_SERVER_URL="https://drive-three-psi.vercel.app" npx cap sync android
```

### Multiple Displays Warning (Foldable Phones)

Samsung Flip/Fold devices have multiple displays. The warning is safe to ignore - it defaults to the main display.

## Artifact Storage

Screenshots and debug artifacts go in `.mobile-debug/` (gitignored).

```
.mobile-debug/
├── screenshot.png      # Latest screenshot
├── before-fix.png      # Comparison screenshots
├── after-fix.png
└── ...
```

## Notes

- Debug builds are NOT optimized - expect slightly slower performance
- Debug builds can coexist with release builds if package names differ
- ADB works as long as USB cable is connected and debugging is enabled
- Android Studio can be closed - CLI tools work independently
