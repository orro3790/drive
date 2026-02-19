# Release Verification and Rollback Playbook

Last updated: 2026-02-19
Bead: `DRV-lwg.4`
Owner: Release owner (Matt)

This playbook defines the executable steps for shipping a Drive release, verifying it post-deploy, monitoring production health, and rolling back if something goes wrong. It covers both the **web layer** (Vercel) and the **Android layer** (Capacitor APK via Play Store).

---

## 1. Pre-Release Checklist

Complete every item before merging `develop` into `main`.

### 1.1 CI Quality Gates

| Gate              | Command / Check                                                      | Must Pass |
| ----------------- | -------------------------------------------------------------------- | --------- |
| Lint              | `pnpm lint` (CI: `ci.yml` → lint job)                                | Yes       |
| Typecheck         | `pnpm check` (CI: `ci.yml` → typecheck job)                          | Yes       |
| Unit tests        | `pnpm test` (CI: `ci.yml` → unit job)                                | Yes       |
| E2E smoke         | Playwright `@smoke` suite (CI: `ci.yml` → e2e_smoke job)             | Yes       |
| Integration smoke | `pnpm test:integration:smoke` (CI: `ci.yml` → integration_smoke job) | Advisory  |
| Build             | `pnpm build` (CI: `ci.yml` → build job)                              | Yes       |

**Action**: Confirm all required CI jobs are green on the PR merging to `develop`. Do not proceed with a red CI.

### 1.2 Launch Capability Matrix

Review `documentation/launch/launch-capability-matrix.md`:

- All 7 capabilities (`LC-01` through `LC-07`) must show `PASS`.
- If any capability has regressed, stop and remediate before release.

### 1.3 Database Migrations

- Confirm all pending Drizzle migrations are committed and applied.
- If the release includes new migrations, verify they have been tested against the Neon production branch (or a preview branch) without errors.
- **Important**: Drizzle migrations are forward-only. There is no automatic rollback. See [Section 5.4](#54-database-migration-rollback) for manual rollback procedure.

### 1.4 Environment Variables

- Confirm any new environment variables are set in the Vercel Dashboard.
- Cross-reference `.env.example` for completeness.
- Verify Firebase credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) are current.
- Verify `CRON_SECRET` and `CRON_BASE_URL` are set in GitHub Actions secrets.

### 1.5 Cron Job Health

Run each cron endpoint manually via GitHub Actions `workflow_dispatch` and confirm 2xx responses:

```
/api/cron/close-bid-windows
/api/cron/auto-drop-unconfirmed
/api/cron/no-show-detection
/api/cron/shift-reminders
/api/cron/send-confirmation-reminders
/api/cron/performance-check
/api/cron/health-daily
/api/cron/health-weekly
/api/cron/stale-shift-reminder
/api/cron/lock-preferences
```

**Action**: Go to GitHub → Actions → "Cron Jobs" → Run workflow → select each route.

---

## 2. Release Process

### 2.1 Web Release (Vercel)

```bash
# 1. Ensure develop is clean and CI is green
git checkout develop
git pull origin develop

# 2. Merge develop into main
git checkout main
git pull origin main
git merge develop
git push origin main

# 3. Switch back to develop
git checkout develop
```

Vercel auto-deploys on push to `main`. The deployment URL is the production domain.

### 2.2 Android Release (Capacitor APK)

Android releases are triggered automatically by **Release Please** when a release is created on `main`:

1. Release Please detects conventional commits and opens a release PR.
2. When the release PR is merged, Release Please creates a GitHub Release with a version tag.
3. The `release-please.yml` workflow builds a signed APK and attaches it to the GitHub Release.
4. The `android-release.yml` workflow also triggers on `release: published` as a fallback.

**Manual trigger** (if needed):

```
GitHub → Actions → "Android Release" → Run workflow → enter version_name and version_code
```

After the APK is built, upload the AAB/APK to Play Console Closed Testing per the [Android Private Distribution Guide](../mobile/android-private-distribution.md#manager-sop-non-technical).

---

## 3. Post-Deploy Verification

### 3.1 Web Verification (immediately after Vercel deploy)

| Check                      | How                                                    | Expected Result                                |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Vercel deployment status   | Vercel Dashboard or `git log origin/main --oneline -1` | Deployment succeeded, matches latest commit    |
| Sign-in (manager)          | Navigate to production URL → sign in as manager        | Dashboard loads, no errors                     |
| Sign-in (driver)           | Navigate to production URL → sign in as driver         | Driver dashboard loads with today's shift data |
| API health                 | `curl -s <prod-url>/api/dashboard` (with auth cookie)  | 200 response with valid JSON                   |
| Cron endpoint reachability | Trigger one cron via `workflow_dispatch`               | 200 response                                   |
| Push notification delivery | Send a test notification via FCM console               | Notification received on test device           |

### 3.2 Android Verification (after APK upload to Play Console)

Follow the **First-3-Install Verification Checklist** from the [Android Private Distribution Guide](../mobile/android-private-distribution.md#first-3-install-verification-checklist):

1. Confirm install/update completes from Play Store.
2. Confirm app launches without crash.
3. Confirm sign-in works.
4. Confirm dashboard data loads over production HTTPS host.
5. Log pass/fail and timestamp in release log.

### 3.3 Smoke Test Routes

After web deployment, manually verify these critical routes:

| Route                    | Role    | What to Check                                          |
| ------------------------ | ------- | ------------------------------------------------------ |
| `/app/dashboard`         | Driver  | Shift card renders, metrics load, pending bids visible |
| `/app/health`            | Driver  | Health score, stars, streak display correctly          |
| `/app/notifications`     | Driver  | Notification list loads, mark-as-read works            |
| `/manage/dashboard`      | Manager | Routes and assignments visible                         |
| `/manage/drivers`        | Manager | Driver list loads with health state                    |
| `/manage/weekly-reports` | Manager | Report summaries render                                |
| `/manage/settings`       | Manager | Onboarding controls accessible                         |

---

## 4. Monitoring

### 4.1 Axiom (Production Logs)

Production logs ship to Axiom (`driver-ops` dataset) via Pino transport.

**Key queries to run after deploy:**

| Signal               | Axiom Query Pattern               | Threshold                        |
| -------------------- | --------------------------------- | -------------------------------- |
| Server errors        | `level: "error"`                  | 0 in first 15 min                |
| Auth rate limits     | `msg: "auth_rate_limit_exceeded"` | Spike above baseline             |
| Cron failures        | `msg: "cron" AND level: "error"`  | 0 per cron cycle                 |
| Signup blocks        | `msg: "auth_signup_blocked"`      | Expected during normal operation |
| Unhandled exceptions | `level: "fatal"`                  | 0 always                         |

### 4.2 Vercel Dashboard

- Check **Functions** tab for error rates and cold start times.
- Check **Deployments** tab to confirm the latest deployment is active and healthy.
- Check **Analytics** (if enabled) for request volume and latency anomalies.

### 4.3 GitHub Actions (Cron Health)

- Navigate to Actions → "Cron Jobs" workflow.
- Confirm scheduled runs are completing successfully (green checks).
- If a cron run fails, check the logs for the specific endpoint that errored.

### 4.4 Neon Database

- Check the Neon Dashboard for connection pool utilization.
- Monitor query latency for degradation after migration changes.
- Verify the production branch is active and responsive.

---

## 5. Rollback Procedures

### 5.1 Web Rollback (Vercel)

**Option A: Instant Rollback via Vercel Dashboard**

1. Open Vercel Dashboard → Deployments.
2. Find the last known good deployment.
3. Click the three-dot menu → "Promote to Production".
4. Confirm the rollback — traffic switches immediately.

**Option B: Git Revert**

```bash
# 1. Revert the merge commit on main
git checkout main
git pull origin main
git revert -m 1 HEAD   # Reverts the merge, keeping main's history
git push origin main

# 2. Vercel auto-deploys the reverted state
```

**Option C: Redeploy Previous Commit**

```bash
# Find the last good commit on main
git log origin/main --oneline -5

# Force deploy a specific commit via Vercel CLI
npx vercel --prod --force
```

**Preference order**: A (fastest, no git changes) → B (clean history) → C (last resort).

### 5.2 Android Rollback

Android rollback is **always forward** (higher `versionCode`). See the [Rollback Playbook](../mobile/android-private-distribution.md#rollback-playbook-rollback-by-hotfix):

1. **Halt** the closed-test rollout in Play Console immediately.
2. **Prepare** a hotfix build with a **higher** `versionCode`.
3. **Upload** the hotfix AAB to the same closed track.
4. **Ask** drivers to update from Play Store.
5. **Verify** recovery on first three updated drivers.

Use the [Rollback Communication Template](../mobile/android-private-distribution.md#rollback-communication-template) for driver messaging.

### 5.3 Cron Job Emergency Disable

If a cron job is causing harm in production:

1. **Immediate**: Go to GitHub → Actions → "Cron Jobs" → disable the workflow (toggle off).
2. **Targeted**: If only one cron route is problematic, add an early-return guard to that endpoint and deploy.
3. **Re-enable**: After fix is deployed, re-enable the workflow and trigger a manual run to confirm.

**Cron schedule reference** (all times UTC):

| Schedule           | Endpoint                                |
| ------------------ | --------------------------------------- |
| Every 15 min       | `/api/cron/close-bid-windows`           |
| Hourly             | `/api/cron/auto-drop-unconfirmed`       |
| 13:00, 14:00 daily | `/api/cron/no-show-detection`           |
| Monday 04:59       | `/api/cron/lock-preferences`            |
| 10:00, 11:00 daily | `/api/cron/shift-reminders`             |
| 10:05, 11:05 daily | `/api/cron/send-confirmation-reminders` |
| 01:00 daily        | `/api/cron/performance-check`           |
| 07:00 daily        | `/api/cron/health-daily`                |
| Monday 08:00       | `/api/cron/health-weekly`               |
| Every 12 hours     | `/api/cron/stale-shift-reminder`        |

### 5.4 Database Migration Rollback

Drizzle migrations are forward-only. If a migration causes issues:

1. **Assess impact**: Is the migration additive (new table/column) or destructive (drop/rename)?
2. **Additive migrations** (most common): Leave the schema in place. Deploy a code-level fix that ignores the new column/table. A cleanup migration can follow later.
3. **Destructive migrations**: Write a manual reverse SQL script and execute against the Neon production branch:

```bash
# Connect to Neon via psql or the Neon SQL Editor
# Execute the reverse migration manually
# Example: ALTER TABLE users ADD COLUMN old_column TEXT;
```

4. **Prevention**: Always test migrations against a Neon preview branch before production.

---

## 6. Incident Response Template

When a production incident is detected, use this template to coordinate response:

```
## Incident: [Title]
**Severity**: [P0/P1/P2]
**Detected**: [timestamp + how detected]
**Impact**: [what's broken, who's affected]

### Timeline
- [HH:MM] Issue detected by [person/alert]
- [HH:MM] Rollback initiated (web/android/cron)
- [HH:MM] Rollback confirmed
- [HH:MM] Root cause identified
- [HH:MM] Fix deployed
- [HH:MM] Verified fix in production

### Rollback Actions Taken
- [ ] Vercel: [promoted previous deployment / reverted commit / N/A]
- [ ] Android: [halted rollout / hotfix published / N/A]
- [ ] Cron: [disabled workflow / added guard / N/A]
- [ ] Database: [no action / manual rollback script / N/A]

### Root Cause
[Description]

### Follow-Up
- [ ] Post-mortem documented
- [ ] Preventive measures identified
- [ ] Monitoring gap addressed
```

---

## 7. Release Checklist Summary

Copy this checklist into the release PR or team channel before each release:

```
## Release Checklist - [date]

### Pre-Release
- [ ] CI green on develop (lint, typecheck, unit, e2e smoke, build)
- [ ] Launch capability matrix: all 7 PASS
- [ ] Database migrations tested
- [ ] Environment variables confirmed in Vercel
- [ ] Cron jobs healthy (manual trigger test)

### Release
- [ ] develop merged to main
- [ ] Vercel deployment succeeded
- [ ] Android APK built (if native changes)

### Post-Deploy Verification
- [ ] Manager sign-in verified
- [ ] Driver sign-in verified
- [ ] Driver dashboard loads
- [ ] Cron endpoint reachable
- [ ] Push notifications delivered (if applicable)
- [ ] Smoke test routes checked

### Sign-Off
- [ ] Release owner: [name]
- [ ] Verified by: [name]
- [ ] Release notes posted
```
