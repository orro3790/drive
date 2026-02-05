# Cron Jobs

This app exposes cron endpoints under `/api/cron`. Vercel invokes these URLs on schedule and sends the `CRON_SECRET` in the `Authorization` header as `Bearer <token>`. All cron routes reject requests unless the header matches the configured `CRON_SECRET`.

## Endpoints

- `/api/cron/performance-check`
  - Purpose: Recalculate driver metrics, apply flagging rules, and adjust weekly caps.
  - Schedule: Daily at 1:00 AM Toronto time (per route comment).
- `/api/cron/shift-reminders`
  - Purpose: Send shift reminder notifications to drivers scheduled today.
  - Schedule: Daily at 6:00 AM Toronto time (per route comment).
- `/api/cron/no-show-detection`
  - Purpose: Detect no-shows after shift start, create bid windows, and alert managers.
  - Schedule: Daily after shift start time (per route comment).
- `/api/cron/lock-preferences`
  - Purpose: Lock driver preferences for week N+2 and generate schedules.
  - Schedule: Monday 04:59 UTC (Sunday 23:59 Toronto EST; per route comment).
- `/api/cron/close-bid-windows`
  - Purpose: Resolve expired bid windows.
  - Schedule: Daily at 00:00 UTC (per route comment).

## Local invocation

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:5173/api/cron/performance-check
```

Notes:

- The server reads `CRON_SECRET` from private env vars and trims whitespace.
- Local calls should include the same header format as Vercel cron.
