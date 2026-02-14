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

- Drivers can submit scheduling preferences and those preferences are locked at the deadline.
- When the schedule generation runs, it creates assignments for the correct future week(s) according to the dispatch rules.
- Assignments are scoped to the correct organization and drivers; no cross-org leakage is allowed.

### Confirmation reminders

- When a shift is approaching and is still unconfirmed, the system sends the correct reminder notification.
- Running the reminder cron multiple times does not duplicate notifications.

### Auto-drop + re-bidding on non-confirmation

- If a driver has not confirmed by the 48-hour deadline, the system automatically drops that driver from the assignment.
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

### Driver lifecycle actions (driver side)

- Drivers can confirm a shift and that confirmation is persisted.
- Drivers can mark arrival and the system treats it as an on-time arrival when within the route start-time deadline.
- Drivers can cancel a shift:
  - Early cancellations do not count as late cancellations.
  - Late cancellations increment the late-cancellation metric.
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

- **UI witness checks**: We are not currently running a browser-based witness pack as part of `pnpm nightly`.
- **Delivery of notifications**: We verify notification records in the DB, but not that Apple/Android push, email, or SMS delivery succeeded.
- **True production environment parity**: Runs against the configured dev database. Production infra differences (secrets, third-party outages, edge runtime quirks) are not fully simulated.
- **Load/scale**: We do not currently stress-test with hundreds/thousands of drivers concurrently.

## Where to Look for Evidence

- Cron E2E report: `logs/nightly/YYYY-MM-DD/cron-e2e-report.md` and `.json`
- Lifecycle E2E report: `logs/nightly/YYYY-MM-DD/lifecycle-e2e-report.md` and `.json`
- Orchestrator summary: `logs/nightly/YYYY-MM-DD/orchestrator-summary.json`

## Operational Notes

- These drills mutate the database. They should only run against a safe, non-production database.
- Drills are designed to be rerunnable without accumulating duplicate state (idempotency is a first-class invariant).
