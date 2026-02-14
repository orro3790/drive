# Nightly: Agent-browser witness verification for automations

Task: DRV-b1l.12

## Steps

1. Add deterministic DOM anchors + "loaded" signals for witness checks (no visual UI change).
   - Notifications:
     - List root: `data-testid="notifications-list"` + `data-loaded="true"` once initial page load completes.
     - Row root: `data-testid="notification-row"` + `data-notification-id` + `data-notification-type`.
   - Schedule:
     - List root: `data-testid="schedule-list"` + `data-loaded="true"` once assignments load completes.
     - Row root: `data-testid="assignment-row"` + `data-assignment-id` + `data-assignment-status`.
2. Implement an agent-browser witness runner (deterministic + safe-by-default).
   - New script: `scripts/nightly/witness-ui.ts`.
   - Read `logs/nightly/<artifactDate>/cron-e2e-report.json` and extract witness IDs.
   - Guardrails:
     - Refuse unless `NIGHTLY_WITNESS_UI=1`.
     - Require `DATABASE_URL` and reject obvious production hosts/DB names (same style as cron-e2e).
     - Never print emails/tokens in logs (redact in report output).
   - Use DB lookups (via `DATABASE_URL`) to map witness userIds -> emails for login (seeded users share password `test1234`).
   - Use agent-browser in mobile viewport (390x844) with exact DOM assertions (no fuzzy "contains"):
     - scheduleAssigned: `/schedule` contains assignmentId; `/notifications` contains `assignment_confirmed`.
     - autoDropped: `/schedule` does NOT contain assignmentId; `/notifications` contains `shift_auto_dropped`.
     - bid winner: `/schedule` contains assignmentId; `/notifications` contains `bid_won`.
     - bid loser: `/notifications` contains `bid_lost`.
     - manager: `/notifications` contains `driver_no_show`.
   - Notifications pagination: if the expected notification isn't in the first page, scroll + re-check with a bounded loop (max N loads) and record NOT_FOUND deterministically.
   - Capture screenshots for each witness check under `logs/nightly/<artifactDate>/screenshots/`.
3. Emit witness artifacts and update the nightly report.
   - Write `logs/nightly/<artifactDate>/witness-ui-report.json` (PASS/FAIL + screenshot paths per flow).
   - Append/replace a `## UI Witness Verification` section in `logs/nightly/<artifactDate>/cron-e2e-report.md` using sentinel markers:
     - `<!-- UI_WITNESS_START -->` and `<!-- UI_WITNESS_END -->`.
   - Write report updates atomically (temp file + rename).
4. Wire commands + docs.
   - Add `pnpm nightly:witness-ui` runner script.
   - Document required env: `BASE_URL` (defaults to `http://localhost:5173`), `DATABASE_URL`, `NIGHTLY_WITNESS_UI=1`.
5. Verification.
   - Ensure `pnpm validate` passes.
   - Smoke-run witness script against a running dev server pointed at the same `DATABASE_URL` used for the cron drill.
   - If any UI mismatch occurs, capture screenshots (already) and file a defect bead with artifact paths + witness IDs.

## Acceptance Criteria

- Agent-browser run produces a deterministic, repeatable witness pack with screenshots.
- UI matches DB outcomes for the selected witnesses.
- Any discrepancy is captured with screenshots and filed as a defect bead.
