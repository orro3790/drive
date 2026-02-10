# Cron Jobs

This app exposes cron endpoints under `/api/cron`. GitHub Actions (`.github/workflows/cron-jobs.yml`) invokes these URLs on schedule and sends the `CRON_SECRET` in the `Authorization` header as `Bearer <token>`. All cron routes reject requests unless the header matches the configured `CRON_SECRET`.

## Endpoints

- `/api/cron/performance-check`
  - Purpose: Recalculate driver metrics, apply flagging rules, and adjust weekly caps.
  - Schedule: `0 1 * * *` (daily at 01:00 UTC).
- `/api/cron/shift-reminders`
  - Purpose: Send shift reminder notifications to drivers scheduled today.
  - Schedule: `0 10,11 * * *` (runs at both UTC offsets so one run lands at 06:00 Toronto; route-level dedupe prevents duplicate reminders).
- `/api/cron/send-confirmation-reminders`
  - Purpose: Send confirmation reminders for shifts 3 days out.
  - Schedule: `5 10,11 * * *` (runs at both UTC offsets so one run lands at 06:05 Toronto; route-level dedupe prevents duplicate reminders).
- `/api/cron/no-show-detection`
  - Purpose: Detect no-shows after shift start, create bid windows, and alert managers.
  - Schedule: `0 13,14 * * *` (dual-run UTC schedule to cover DST, with in-service Toronto cutoff guard).
- `/api/cron/lock-preferences`
  - Purpose: Lock driver preferences for week N+2 and generate schedules.
  - Schedule: `59 4 * * 1` (Monday 04:59 UTC; code computes Toronto week boundary internally).
- `/api/cron/close-bid-windows`
  - Purpose: Resolve expired bid windows.
  - Schedule: `*/15 * * * *` (every 15 minutes).

## Local invocation

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:5173/api/cron/performance-check
```

Notes:

- The server reads `CRON_SECRET` from private env vars and trims whitespace.
- Local calls should include the same header format as the scheduled GitHub workflow caller.
