---
name: deploy
description: Deployment workflow for Drive. Explains the hybrid Capacitor + Vercel architecture and how to ship changes.
---

# Deploy

## Architecture Overview

Drive uses a **hybrid Capacitor + Vercel** architecture:

```
┌─────────────────────────────────────────────────────┐
│  Android APK (Capacitor)                            │
│  ├── Native shell (MainActivity, plugins)          │
│  └── WebView loads from → Vercel (mobile-shell/)   │
└─────────────────────────────────────────────────────┘
```

- **Web content** is served from Vercel, not bundled in the APK
- **Native code** (MainActivity.java, Capacitor plugins) is in the APK
- APK only needs rebuilding when native code changes
- Web/UI changes deploy instantly via Vercel

## Standard Deployment (Web Changes)

For any web/UI/CSS/JS changes:

```bash
# 1. Commit to develop
git checkout develop
git add -A && git commit -m "fix(scope): description"
git push origin develop

# 2. Merge to main (triggers Vercel deploy)
git checkout main
git merge develop
git push origin main

# 3. Switch back to develop
git checkout develop
```

Vercel auto-deploys on push to `main`. Mobile app loads new content on next launch/refresh.

## When to Rebuild APK

Rebuild the Android APK only when changing:

- `android/app/src/main/java/**` (native Java/Kotlin)
- `capacitor.config.ts` (Capacitor config)
- Capacitor plugin versions in `package.json`
- Android manifest, resources, or splash screens

```bash
pnpm build              # Build web assets
npx cap sync android    # Sync to android/
npx cap open android    # Open in Android Studio
# Build APK/AAB in Android Studio
```

## Vercel Configuration

- **Production branch**: `main`
- **Build command**: `pnpm build`
- **Output directory**: `mobile-shell/` (for Capacitor), `.svelte-kit/` (for web)
- **Environment variables**: Set in Vercel Dashboard (DATABASE_URL, BETTER_AUTH_SECRET, Firebase vars)

## Debugging Deployment Issues

### Web content not updating on device

1. Force close app and reopen
2. Check Vercel deployment status
3. Verify correct branch was deployed:
   ```bash
   git log main --oneline -3
   ```

### CSS/insets not working on Android

The app uses Capacitor's SystemBars plugin (`insetsHandling: 'css'`) to inject safe area CSS variables. These are injected at runtime by the native layer.

- `--safe-area-inset-top`, `--safe-area-inset-bottom`, etc.
- Fallback minimums in `app.css` for `html[data-native='true']`

### Checking what's deployed

```bash
# Latest deployed commit
git log origin/main --oneline -1

# Compare with local
git log develop --oneline -1
```

## Branch Workflow

```
feature-branch → develop → main
                    │         │
                    │         └── Vercel production deploy
                    └── Development/staging
```

- **develop**: Integration branch, always deployable
- **main**: Production, triggers Vercel deploy
- **feature branches**: Named `DRV-xxx/implementation` for BEADS tasks
