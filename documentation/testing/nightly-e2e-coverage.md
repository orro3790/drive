# Nightly E2E Coverage (Cron + Lifecycle)

This document summarizes what our nightly end-to-end drills prove today.

It is written for non-technical stakeholders: what behavior we have exercised against the real database, what outcomes we verify, and what remains out of scope.

## What "End-to-End" Means Here

We run two nightly drills:

1. **Cron E2E**: Reseeds a deterministic dataset, then runs the cron endpoints in sequence and verifies outcomes via database evidence (including idempotency).
2. **Lifecycle E2E**: Calls driver/manager API handlers directly (same code paths as production endpoints), mutates assignments (confirm, arrive, cancel, etc.), and verifies downstream effects in the database.

Both drills produce reports under `logs/nightly/YYYY-MM-DD/`.

## Coverage Checklist (Plain English)

### Scheduling pipeline

- Drivers can submit scheduling preferences and those preferences are locked at the deadline. (Partially proven — the lock cron runs against UTC-derived time; DST-boundary correctness and full cycle-bypass scenarios are not yet exercised.)
- When the schedule generation runs, it creates assignments for the correct future week(s) according to the dispatch rules. (Partially proven — DST-boundary weeks where Toronto crosses a clock change are not tested; the drill runs in a fixed-offset window.)
- Assignments are scoped to the correct organization and drivers; no cross-org leakage is allowed.

### Confirmation reminders

- When a shift is approaching and is still unconfirmed, the system sends the correct reminder notification.
- Running the reminder cron multiple times does not duplicate notifications.

### Auto-drop + re-bidding on non-confirmation

- If a driver has not confirmed by the 48-hour deadline, the system automatically drops that driver from the assignment. (Partially proven — drop + bid-open are not wrapped in a single transaction; partial-failure scenarios are not exercised.)
- The system opens a bidding window to backfill the vacant shift.
- The dropped driver receives the expected notification for being dropped.
- Re-running the auto-drop cron does not drop twice or create duplicate windows.

### Bidding behavior

- When a competitive bidding window closes, the scoring algorithm selects exactly one winner.
- The selected winner is assigned the shift and receives a bid-won notification.
- Losing bidders receive bid-lost notifications.
- Re-running the bid-close cron does not double-award, double-notify, or corrupt the assignment.

### Instant-mode bid windows (within 24 hours)

- When a shift is within 24 hours, the system can open a bid window in "instant" mode (for example after certain cancellations).
- We verify the window mode/state in the database.
- We do **not** currently prove (in these drills) the full "first bidder immediately wins" path end-to-end.
- That race path is now covered by the integration adversarial suite (`ADV-001` through `ADV-003`) under `tests/integration/adversarial/`.

### Driver lifecycle actions (driver side)

- Drivers can confirm a shift and that confirmation is persisted.
- Drivers can mark arrival and the system treats it as an on-time arrival when within the route start-time deadline.
- Drivers can cancel a shift:
  - Early cancellations do not count as late cancellations.
  - Late cancellations increment the late-cancellation metric. (Partially proven — the late-cancel cutoff is compared against route start time, but the drill does not test edge cases around the exact cutoff boundary.)
  - Cancellations create a replacement bidding window.

### No-show detection + emergency coverage

- After the route start time, confirmed-but-not-arrived assignments are detected as no-shows.
- A replacement/emergency bidding window is opened.
- Health/metrics are updated consistently.
- Re-running the no-show cron does not duplicate outcomes.

### Driver health scoring and flagging

- Daily health scoring recomputes driver health consistently.
- Weekly health scoring updates the longer-term state (including star progression rules).
- Driver flagging and reinstatement flows update both driver status and auditability.
- Both daily and weekly health jobs are idempotent.

## Not Yet Proven by the Nightlies

These drills deliberately do **not** prove every production behavior:

- **UI witness checks**: We have an optional browser-based witness pack (`pnpm nightly:witness-ui`). The orchestrator (`pnpm nightly`) will run it only when a dev server is reachable at `BASE_URL` (default `http://localhost:5173`).
- **Delivery of notifications**: We verify notification records in the DB, but not that Apple/Android push, email, or SMS delivery succeeded.
- **Notification delivery reliability**: FCM error handling, retry semantics, and token-refresh edge cases are not tested end-to-end.
- **FCM error taxonomy**: The system does not yet classify FCM failures (invalid token, quota exceeded, server error) into distinct recovery paths.
- **Orchestrator report consistency**: The orchestrator summary aggregates sub-report results, but consistency between the summary and individual reports is not validated.
- **True production environment parity**: Runs against the configured dev database. Production infra differences (secrets, third-party outages, edge runtime quirks) are not fully simulated.
- **Load/scale**: We do not currently stress-test with hundreds/thousands of drivers concurrently.

## Known Gaps (Critical/High)

Issues identified during the 2026-02-18 coverage audit. Each entry links to the corresponding audit file.

| Priority      | Gap                                                                                                                                                                                                       | Bead       | Notes                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------- |
| Critical      | **DST enforcement mismatch** — Preference-lock and schedule-generation crons use UTC-derived time; Toronto DST transitions can shift the effective deadline by an hour.                                   | drv-xnb.2  | Validated 2026-02-18. See `tmp/DRV-hfh.2-wt/` |
| Critical      | **Preference lock-cycle bypass** — No test proves the full lock → generate → assign cycle with edge-case timing (e.g., preferences submitted seconds before lock).                                        | drv-xnb.4  | Validated 2026-02-18. See `tmp/DRV-hfh.2-wt/` |
| Critical      | **Signup join non-atomicity** — The signup + org-join flow is not wrapped in a single transaction; a crash between user creation and org membership leaves an orphaned user.                              | drv-xnb.5  | Validated 2026-02-18. See `tmp/DRV-hfh.3-wt/` |
| Critical/High | **Auto-drop transactional coupling** — The auto-drop cron drops the assignment and opens a bid window in separate operations; partial failure can leave an assignment dropped with no replacement window. | drv-xnb.3  | Validated 2026-02-18. See `tmp/DRV-hfh.2-wt/` |
| High          | **Notification reliability / FCM error taxonomy** — FCM failures are not classified or retried; a single send failure silently drops the notification.                                                    | drv-xnb.8  | Validated 2026-02-18. See `tmp/DRV-hfh.3-wt/` |
| High          | **Orchestrator report consistency** — The orchestrator summary may disagree with individual sub-reports if a sub-report fails mid-write.                                                                  | drv-xnb.11 | Validated 2026-02-18. See `tmp/DRV-hfh.3-wt/` |

## Where to Look for Evidence

- Cron E2E report: `logs/nightly/YYYY-MM-DD/cron-e2e-report.md` and `.json`
- Lifecycle E2E report: `logs/nightly/YYYY-MM-DD/lifecycle-e2e-report.md` and `.json`
- Orchestrator summary: `logs/nightly/YYYY-MM-DD/orchestrator-summary.json`

## Operational Notes

- These drills mutate the database. They should only run against a safe, non-production database.
- Drills are designed to be rerunnable without accumulating duplicate state (idempotency is a first-class invariant).

## How To Run On Demand

- Start the dev server: `pnpm dev`
- Run the full pack:
  - `pnpm nightly` (runs cron + lifecycle, and runs witness-ui if the dev server is reachable)
- Or run just the witness pack:
  - `pnpm nightly:witness-ui`
