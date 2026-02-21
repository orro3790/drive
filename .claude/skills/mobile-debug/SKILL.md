---
name: mobile-debug
description: "Take screenshots of the Android phone, debug mobile UI/UX with ADB. TRIGGERS: user mentions 'screenshot', 'phone screen', 'take a picture', 'what does it look like', 'mobile debug', or asks to see the Android device display."
---

# Mobile Debug Workflow

Debug the Android app in tandem with the user. Take screenshots automatically to verify fixes rather than assuming they work.

## Prerequisites

- Android Studio installed (provides Android SDK)
- Phone connected via USB with USB debugging enabled
- ADB available at `$LOCALAPPDATA/Android/Sdk/platform-tools`

## Screenshot Workflow

**ALWAYS use the screenshot script** — raw adb commands corrupt or fail on Windows.

### Take Screenshot

```bash
pnpm mobile:screenshot
```

Then read the screenshot:

```
Read(.mobile-debug/screenshot.png)
```

### Multiple Screenshots

For comparing before/after, use descriptive names:

```bash
pnpm mobile:screenshot before-fix.png
# ... make changes ...
pnpm mobile:screenshot after-fix.png
```

### Why Not Raw ADB?

Three compounding issues make raw `adb screencap` unreliable in this environment:

1. **Binary corruption**: `adb exec-out screencap -p > file.png` corrupts binary data due to MSYS line-ending conversion.
2. **MSYS path mangling**: Git Bash converts `/sdcard/...` to `C:/Program Files/Git/sdcard/...`. Must use `MSYS_NO_PATHCONV=1` prefix if calling adb directly.
3. **Foldable display warning**: Samsung Flip/Fold devices warn about multiple displays. Safe to ignore — defaults to main display.

The `pnpm mobile:screenshot` script handles all three by using Node.js `execSync` (bypasses MSYS) with a two-step capture (screencap on device → `adb pull`).

**NEVER** use raw `adb exec-out screencap` or pipe `adb shell screencap` directly from bash.

## Development Modes

### Live Development (Recommended)

For rapid iteration with hot reload — no rebuild needed:

```bash
pnpm mobile:android:sync:usb   # One-time: point app at localhost
pnpm mobile:android:open       # One-time: install on device
pnpm dev:mobile                # Run this each session
```

Changes hot-reload instantly. Use this for UI/UX iteration.

### Production-like Testing

Test against the actual Vercel deployment:

```bash
pnpm mobile:android:sync:prod
cd android && .\\gradlew.bat installDebug
```

### Full Rebuild (after native/Gradle changes)

```bash
cd /c/Users/matto/projects/drive/android
.\\gradlew.bat clean installDebug
```

## Debug Iteration Loop

1. **Take screenshot** to see current state
2. **Identify issue** with user
3. **Make fix** in code
4. If using live dev: changes hot-reload automatically
5. If using prod sync: `pnpm mobile:android:sync:prod && cd android && .\\gradlew.bat installDebug`
6. **Take screenshot** to verify fix
7. **Repeat** until user is satisfied

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
