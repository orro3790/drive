# Nightly: Cron/algorithm E2E drill + DB evidence report

Task: DRV-b1l.11

## Steps

1. Add a dedicated runner command + safety guardrails.
   - Add `pnpm nightly:cron-e2e` (single-worker Vitest config; no `INTEGRATION_TEST` aliasing).
   - Refuse to run unless `NIGHTLY_CRON_E2E=1` and `DATABASE_URL` passes a denylist/allowlist preflight (fail closed on parse errors / obvious production hosts).
   - Acquire a Postgres advisory lock to prevent concurrent drills against the shared dev DB.
2. Deterministic reseed on the existing `DATABASE_URL`.
   - Run `pnpm seed -- --deterministic --seed=<fixed> --anchor-date=<fixed>`.
   - Anchor date must be after `dispatchPolicy.confirmation.deploymentDate` (>= 2026-03-01) so confirmation/auto-drop logic actually executes.
   - Sanity-check seed outputs (seed orgs exist; drivers/routes/assignments/bid windows present) and record key IDs.
3. Execute cron endpoints via their SvelteKit route handlers (real HTTP handler modules) with `Authorization: Bearer ${CRON_SECRET}`.
   - Pass 1: run all required endpoints in a defined order under a frozen clock aligned to the seed anchor.
   - Pass 2: rerun the same order to prove idempotency.
   - (Optional) include `performance-check`, `shift-reminders`, `stale-shift-reminder` if they can be exercised deterministically.
4. DB evidence + invariants per cron (pass/fail with explicit predicates).
   - `lock-preferences`: Week N+2 assignments org-scoped; per-driver assignments <= `weeklyCap`; no flagged drivers assigned; `assignment_confirmed`/`schedule_locked` notifications do not duplicate on rerun.
   - `send-confirmation-reminders`: `confirmation_reminder` notifications created for the target date and do not increase on pass 2.
   - `auto-drop-unconfirmed`: unconfirmed shifts past 48h deadline create replacement bid windows + `shift_auto_dropped` notifications; pass 2 creates no additional windows/notifications.
   - `close-bid-windows`: expired windows resolve to exactly 1 winner; losers get `bid_lost`, winner gets `bid_won`; winner's assignment `assignedBy='bid'`; pass 2 creates no duplicate resolution/notifications.
   - `no-show-detection`: confirmed-but-not-arrived assignments create emergency bid windows; manager alert exists when route has a manager; pass 2 creates no duplicate windows/alerts.
   - `health-daily`/`health-weekly`: writes are idempotent (upserts); pass 2 does not create duplicate snapshots/notifications for the same evaluation window.
5. Write artifacts to `logs/nightly/YYYY-MM-DD/` and make them actionable.
   - `cron-e2e-report.json`: run metadata (timestamp, seed args, env fingerprint), per-cron pass1/pass2 results, invariant outcomes, and key entity IDs (org/driver/assignment/bid_window) for witness follow-up (DRV-b1l.12).
   - `cron-e2e-report.md`: human-readable PASS/FAIL summary with screenshot-ready witness IDs.
   - On invariant failure: exit non-zero and file defect bead(s) with repro command + artifact pointers.

## Acceptance Criteria

- One command executes the full drill from a clean reseed and ends with PASS/FAIL.
- Each cron endpoint is exercised and verified by DB evidence (not just HTTP 200).
- Rerunning the drill does not create duplicate notifications/windows/assignments (idempotency proven).
