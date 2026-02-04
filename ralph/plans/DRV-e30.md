# Preference lock cron job

Task: DRV-e30

## Steps

1. Review docs/specs/SPEC.md and docs/adr/003-scheduling-model.md plus existing scheduling/notification services to define Week N+2 boundary (e.g., Monday 00:00 America/Toronto) and confirm locking, scheduling, and notification rules.
2. Implement or update src/routes/api/cron/lock-preferences/+server.ts to validate CRON_SECRET, compute Toronto Week N+2 start using a DST-safe helper, and add structured logs (start/end, target week, counts, errors).
3. Add idempotent preference locking for Week N+2 (skip already locked) and ensure safe retries if later steps fail.
4. Run schedule generation with idempotency guards (avoid duplicate assignments for the target week) and capture results for logging/diagnostics.
5. Send assignment notifications with de-duplication per driver/week and configure Vercel cron in vercel.json for Sunday 23:59 America/Toronto with a sanity check of auth/error handling.

## Acceptance Criteria

- Cron runs every Sunday at 23:59 Toronto time
- All driver preferences have lockedAt set for the target week
- Schedule generation runs automatically after lock
- Each driver receives notification about their new assignments
- Job is idempotent (re-running doesn't duplicate work)
- Job execution logged for debugging
