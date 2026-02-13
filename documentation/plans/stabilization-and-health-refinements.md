# Stabilization & Health Scoring Refinements Plan

## Context

Post-enterprise multi-tenant epic. Demo revealed bugs across driver and manager flows. Health scoring penalty values need alignment with business intent. Seed data and notification types need cleanup.

---

## Phase 1: Critical Bug Fixes ✅

### 1.1 Fix `/api/preferences/routes` missing org filter ✅

Added `eq(warehouses.organizationId, organizationId)` filter.

### 1.2 Fix manager warehouses empty state ✅

Fixed Zod schema to use `z.coerce.number()` for PostgreSQL string counts.

### 1.3 Audit all API endpoints for org filter completeness ✅

| Endpoint                       | Status    | Action Taken                                   |
| ------------------------------ | --------- | ---------------------------------------------- |
| `GET /api/warehouses`          | OK        | Uses `getManagerWarehouseIds()`                |
| `GET /api/routes`              | OK        | Uses `getManagerWarehouseIds()`                |
| `GET /api/drivers`             | OK        | Filters `user.organizationId`                  |
| `GET /api/preferences/routes`  | **Fixed** | Added org filter via warehouse join            |
| `GET /api/dashboard`           | OK        | User-scoped (implicit org)                     |
| `GET /api/assignments/mine`    | OK        | User-scoped (implicit org)                     |
| `GET /api/bids/available`      | OK        | Explicitly filters `warehouses.organizationId` |
| `GET /api/bids/mine`           | **Fixed** | Added `warehouses.organizationId` filter       |
| `GET /api/driver-health`       | OK        | User-scoped (implicit org)                     |
| `GET /api/notifications`       | **Fixed** | Added `notifications.organizationId` filter    |
| `GET /api/weekly-reports`      | OK        | Uses `getManagerWarehouseIds()`                |
| `GET /api/drivers/[id]/shifts` | OK        | Verifies driver in same org                    |

---

## Phase 2: Health Scoring Refinements ✅

- Added `earlyCancel: -8` penalty for driver-initiated cancellations (>48h)
- Adjusted `lateCancel: -48` → `-32` (4 days' max)
- Kept `autoDrop: -12` (worse than early cancel — driver didn't engage)
- Raised `correctiveCompletionThreshold: 0.8` → `0.98`
- Added `earlyCancellations` to `HealthContributions` type, `computeContributions()`, seed generator, HealthCard UI
- Updated notification copy for corrective_warning (80% → 98%)
- Documented late start = no-show in quickref

---

## Phase 3: Notification Cleanup ✅

- `schedule_locked` now sent from lock-preferences cron to all locked drivers
- `manual` removed from seed secondary/manager notification lists (reserved for future)
- Replaced `manual` with `return_exception` in manager seed notifications

---

## Phase 4: Seed Data Overhaul ✅

Full 7-phase overhaul completed. See `C:\Users\matto\.claude\plans\imperative-petting-mist.md` for detailed implementation plan.

### 4.1 Verify org structure completeness ✅

- [x] Organization with join code (2 orgs: seed-org-a, seed-org-b)
- [x] Test user as org owner
- [x] Managers assigned to warehouses via `warehouseManagers`
- [x] Drivers assigned to org
- [x] All managers have at least 1 warehouse assignment

### 4.2 Review seed data realism ✅

- [x] Shift arrival times relative to route startTime (Phase 7)
- [x] Health snapshots populated for all non-new drivers
- [x] driverHealthState records exist (9 org-a, 3 org-b)
- [x] Bid windows: competitive, instant, emergency modes present
- [x] Hard-stop drivers: 1 per org (pool ineligible, requires manager intervention)
- [x] Star distribution: 0–4 stars across drivers; 4-star exemplary drivers exist

### 4.3 Multi-org isolation ✅

- [x] 0 cross-org assignments, preferences, bids (SQL verified)
- [x] Distinct warehouse names per org (org-a: Mississauga West/Scarborough East, org-b: Brampton North)
- [x] Distinct email domains (@driver.test vs @hamilton-driver.test)
- [x] API returns org-scoped data (verified via curl and browser)

### 4.4 Bugs found & fixed during verification

- **Warehouse name collision**: org-b reused org-a's names. Fixed with `warehouseOffset` in config.
- **Timezone double-conversion**: `getTorontoToday()` + `toTorontoDateString()` applied `toZonedTime()` twice, shifting all seed dates back 1 day. Today's lifecycle stages landed on yesterday. Fixed by rewriting `scripts/seed/utils/dates.ts` to use UTC dates with Toronto date components — single timezone conversion in `getTorontoTodayString()`, everything else reads UTC components directly. After fix: `isArrivable: true` for confirmed today shifts, dates align with `CURRENT_DATE`.

---

## Phase 5: End-to-End Flow Verification Checklist

### Driver Flows

| #   | Flow                       | Steps                                        | Verified      | Notes                                                                                                                        |
| --- | -------------------------- | -------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1  | Sign in as driver          | Login with `@driver.test` account            | ✅ 2026-02-13 | judah_lueilwitz64, delta.schulist70, filiberto.rodriguez73, orgb_driver002                                                   |
| D2  | View dashboard             | See today's shift, metrics, pending bids     | ✅ 2026-02-13 | Today shift with "I'm On Site", week summary, pending bids, confirmations all render correctly                               |
| D3  | View health card           | Score, stars, streak, contributions visible  | ✅ 2026-02-13 | 0★ hard-stop (score 0, Action Required), 2★ (score 78), 4★ (score 208, "Bonus active"), 4★ org-b (score 169, "Bonus active") |
| D4  | Change day preferences     | Toggle preferred days, save successfully     |               |                                                                                                                              |
| D5  | Change route preferences   | Select routes (from own org only), save      |               |                                                                                                                              |
| D6  | View schedule              | See upcoming assignments with correct dates  | ✅ 2026-02-13 | This week/next week with day chips. Dates now aligned with CURRENT_DATE after timezone fix                                   |
| D7  | Confirm upcoming shift     | Confirm a scheduled assignment within window |               | Unblocked by timezone fix. Ready to test                                                                                     |
| D8  | Arrive for shift           | Mark arrival on day of shift                 |               | Unblocked: `isArrivable: true`. "I'm On Site" button visible for judah (org-a) and orgb_driver002 (org-b)                    |
| D9  | Start shift (parcel count) | Enter parcelsStart count                     |               | Unblocked. Ready to test (depends on D8)                                                                                     |
| D10 | Complete shift             | Enter parcelsReturned, see edit window       |               | Unblocked. Ready to test (depends on D9)                                                                                     |
| D11 | Edit shift within window   | Modify parcel counts within 1-hour window    |               | Unblocked. Ready to test (depends on D10)                                                                                    |
| D12 | Cancel a future shift      | Cancel and see health impact                 |               | Unblocked. Ready to test                                                                                                     |
| D13 | Browse available bids      | See open bid windows for org routes          | ✅ 2026-02-13 | Pending bids with countdown ("Closes in 1 day", "2 days"). Org-scoped routes confirmed                                       |
| D14 | Place a bid                | Bid on an available shift                    |               |                                                                                                                              |
| D15 | View notifications         | See notification inbox with correct types    | ✅ 2026-02-13 | shift_reminder ("today"), bid_won/bid_lost with route data. Grouped by TODAY/YESTERDAY                                       |
| D16 | Mark notification read     | Toggle read status                           |               |                                                                                                                              |

**Org isolation verified**: org-b driver (orgb_driver002@hamilton-driver.test) sees only BN routes / Brampton North. "I'm On Site" active. 4★ with "Bonus active".

**Timezone fix (2026-02-13)**: Rewrote `scripts/seed/utils/dates.ts` — single `toZonedTime()` call in `getTorontoTodayString()`, all other functions use UTC components. Dates now align with `CURRENT_DATE`. `isArrivable: true` confirmed. D7–D12 unblocked.

### Manager Flows

| #   | Flow                           | Steps                                      | Verified | Notes |
| --- | ------------------------------ | ------------------------------------------ | -------- | ----- |
| M1  | Sign in as manager             | Login with manager account                 |          |       |
| M2  | View warehouses                | See warehouses for assigned org            |          |       |
| M3  | Create warehouse               | Create new warehouse (auto-assigned)       |          |       |
| M4  | View routes                    | See routes for accessible warehouses       |          |       |
| M5  | Create route                   | Create route under a warehouse             |          |       |
| M6  | View drivers list              | See drivers in same org with metrics       |          |       |
| M7  | View driver shift history      | Click driver → see completed shifts        |          |       |
| M8  | View weekly reports            | See aggregated parcel totals               |          |       |
| M9  | View weekly report detail      | Click week → see individual shifts         |          |       |
| M10 | Manage whitelist               | Create approval, see entries, revoke       |          |       |
| M11 | View notifications             | See manager-specific alerts                |          |       |
| M12 | Receive no-show alert          | Verify driver_no_show notification arrives |          |       |
| M13 | Receive return exception alert | Verify return_exception alert              |          |       |

### Automated System Flows

| #   | System                 | Expected Behavior                                     | Verified | Notes |
| --- | ---------------------- | ----------------------------------------------------- | -------- | ----- |
| A1  | Schedule generation    | Generates assignments 2 weeks out on Sunday lock      |          |       |
| A2  | Confirmation reminders | Sent 3 days before unconfirmed shift                  |          |       |
| A3  | Auto-drop unconfirmed  | Drops unconfirmed shifts at 48h deadline              |          |       |
| A4  | No-show detection      | Drops driver at route start time, opens emergency bid |          |       |
| A5  | Bid window closure     | Resolves competitive bids, transitions instant        |          |       |
| A6  | Performance check      | Recalculates metrics, applies flags                   |          |       |
| A7  | Daily health eval      | Computes scores, persists snapshots                   |          |       |
| A8  | Weekly health eval     | Evaluates star progression                            |          |       |
| A9  | Shift reminders        | Morning notification for today's shift                |          |       |
| A10 | Stale shift reminders  | Reminds driver to close 12h+ open shift               |          |       |

---

## Implementation Order

1. **Phase 1** (bug fixes) — Immediate. These are blocking demo-ability.
2. **Phase 2** (health scoring) — Next. Config changes + health.ts contribution logic.
3. **Phase 3** (notifications) — Quick. Cron tweak + seed cleanup.
4. **Phase 4** (seed data) — After scoring changes. Reseed with correct values.
5. **Phase 5** (E2E verification) — Final gate. Walk every flow, fill the checklist.

---

## Files Touched (Summary)

| File                                                               | Changes                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| `src/routes/api/preferences/routes/+server.ts`                     | Add org filter                                                 |
| `src/lib/config/dispatchPolicy.ts`                                 | Add earlyCancel, adjust lateCancel, raise corrective threshold |
| `src/lib/server/services/health.ts`                                | Add earlyCancel contribution query                             |
| `src/routes/api/cron/lock-preferences/+server.ts`                  | Send schedule_locked notifications                             |
| `scripts/seed/generators/notifications.ts`                         | Remove manual from seed showcase                               |
| `documentation/agent-guidelines/health-and-automation-quickref.md` | Update all changed values                                      |
| Various API endpoints                                              | Verify org filters (audit)                                     |
| Manager warehouses page                                            | Add empty state messaging                                      |
