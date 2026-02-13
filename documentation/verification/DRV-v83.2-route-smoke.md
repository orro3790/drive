# DRV-v83.2 Driver Route Smoke Matrix (Mobile)

Date: 2026-02-13
Bead: `DRV-v83.2`

## Scope

- Viewport: `390x844` (mobile)
- Sessions:
  - Driver: `delta.schulist70@driver.test`
  - Manager: `nathan_jast25@drivermanager.test`
  - Unauthenticated: fresh browser session
- Routes covered:
  - `/dashboard`
  - `/schedule`
  - `/bids`
  - `/notifications`
  - `/settings`
  - `/sign-in`
  - `/dashboard` as manager
  - `/dashboard` unauthenticated

## Route Results

| Route                     | Render check                                             | JS errors | Horizontal scroll   | Guard behavior                                       | Screenshot                                                                               |
| ------------------------- | -------------------------------------------------------- | --------- | ------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/dashboard` (driver)     | PASS (health panel, shift section, pending bids visible) | PASS      | PASS (`overflow=0`) | n/a                                                  | `documentation/verification/screenshots/DRV-v83.2/dashboard-mobile.png`                  |
| `/schedule` (driver)      | PASS (assignment list for current/next week visible)     | PASS      | PASS (`overflow=0`) | n/a                                                  | `documentation/verification/screenshots/DRV-v83.2/schedule-mobile.png`                   |
| `/bids` (driver)          | PASS (open shifts + bid actions visible)                 | PASS      | PASS (`overflow=0`) | n/a                                                  | `documentation/verification/screenshots/DRV-v83.2/bids-mobile.png`                       |
| `/notifications` (driver) | PASS (inbox + mark-all action visible)                   | PASS      | PASS (`overflow=0`) | n/a                                                  | `documentation/verification/screenshots/DRV-v83.2/notifications-mobile.png`              |
| `/settings` (driver)      | PASS (profile/preferences/password sections visible)     | PASS      | PASS (`overflow=0`) | n/a                                                  | `documentation/verification/screenshots/DRV-v83.2/settings-mobile.png`                   |
| `/sign-in` (unauth)       | PASS (email/password/sign-in controls visible)           | PASS      | PASS (`overflow=0`) | n/a                                                  | `documentation/verification/screenshots/DRV-v83.2/signin-mobile.png`                     |
| `/dashboard` (manager)    | n/a                                                      | PASS      | PASS                | PASS (driver route blocked; redirected to `/routes`) | `documentation/verification/screenshots/DRV-v83.2/dashboard-manager-redirect-mobile.png` |
| `/dashboard` (unauth)     | n/a                                                      | PASS      | PASS                | PASS (redirect to `/sign-in?redirect=%2Fdashboard`)  | `documentation/verification/screenshots/DRV-v83.2/dashboard-unauth-redirect-mobile.png`  |

## Cross-Cutting Mobile Checks

- No JavaScript runtime errors observed on tested routes (`agent-browser errors` clean on each route).
- No horizontal overflow detected on tested routes.
- Design language appears consistent with existing tokenized surfaces and status colors (no obvious off-palette regressions observed in smoke pass).

## Defects Found (for DRV-v83.4)

### [HIGH] Touch targets below 44px on primary navigation and key actions

- **Location:** Driver routes (`/dashboard`, `/schedule`, `/bids`, `/notifications`, `/settings`), plus `/sign-in`
- **Expected:** Primary interactive controls meet or exceed 44x44 px touch target guidance.
- **Actual:** Multiple controls measure around 28 px height (and some sign-in controls under 44 px), including nav actions and route actions.
- **Impact:** High mis-tap risk on mobile, especially one-handed use.

### [MEDIUM] Common body copy renders below 16px

- **Location:** Driver routes and auth screen
- **Expected:** Body-level copy at or above 16 px for mobile readability.
- **Actual:** Paragraph-level text commonly renders at ~14.224 px.
- **Impact:** Reduced readability and accessibility on mobile.

### [LOW] Role-guard redirect target differs from bead expectation

- **Location:** `/dashboard` as manager
- **Expected (bead text):** Redirect to `/?error=access_denied`.
- **Actual:** Redirect lands on `/routes`.
- **Impact:** Role guard still works, but acceptance text and runtime behavior are out of sync.

## Overall Verdict

`WARN`

Functional route smoke checks and guard checks pass, but mobile quality gates for target size and body text do not meet the strict criteria in `DRV-v83.2`. Defects are documented for follow-up in `DRV-v83.4`.
