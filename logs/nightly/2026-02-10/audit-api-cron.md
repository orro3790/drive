# DRV-cxc Nightly Audit - Cron API Endpoints

Date: 2026-02-10
Task: DRV-cxc

## Scope

- `src/routes/api/cron/auto-drop-unconfirmed/+server.ts`
- `src/routes/api/cron/close-bid-windows/+server.ts`
- `src/routes/api/cron/health-daily/+server.ts`
- `src/routes/api/cron/health-weekly/+server.ts`
- `src/routes/api/cron/lock-preferences/+server.ts`
- `src/routes/api/cron/no-show-detection/+server.ts`
- `src/routes/api/cron/performance-check/+server.ts`
- `src/routes/api/cron/send-confirmation-reminders/+server.ts`
- `src/routes/api/cron/shift-reminders/+server.ts`
- Supporting logic and scheduling config:
  - `.github/workflows/cron-jobs.yml`
  - `src/lib/server/services/bidding.ts`
  - `src/lib/server/services/health.ts`
  - `src/lib/server/services/noshow.ts`
  - `src/lib/server/services/scheduling.ts`
  - `documentation/agent-guidelines.md`

## Endpoint Coverage Checklist

| Expected endpoint                       | Found route                                                      | Status    |
| --------------------------------------- | ---------------------------------------------------------------- | --------- |
| `/api/cron/lock-preferences`            | `src/routes/api/cron/lock-preferences/+server.ts`                | Audited   |
| `/api/cron/close-bid-windows`           | `src/routes/api/cron/close-bid-windows/+server.ts`               | Audited   |
| `/api/cron/no-show-detection`           | `src/routes/api/cron/no-show-detection/+server.ts`               | Audited   |
| `/api/cron/send-confirmation-reminders` | `src/routes/api/cron/send-confirmation-reminders/+server.ts`     | Audited   |
| `/api/cron/auto-drop-unconfirmed`       | `src/routes/api/cron/auto-drop-unconfirmed/+server.ts`           | Audited   |
| `/api/cron/shift-reminders`             | `src/routes/api/cron/shift-reminders/+server.ts`                 | Audited   |
| `/api/cron/performance-check`           | `src/routes/api/cron/performance-check/+server.ts`               | Audited   |
| `/api/cron/health-daily`                | `src/routes/api/cron/health-daily/+server.ts`                    | Audited   |
| `/api/cron/health-weekly`               | `src/routes/api/cron/health-weekly/+server.ts`                   | Audited   |
| Rate-limit cron endpoint                | No route found under `src/routes/api/cron/` or `src/routes/api/` | Not found |

## Findings Summary

- Critical: 1
- High: 2
- Medium: 2
- Low: 1

## Findings

### CRITICAL - `auto-drop-unconfirmed` applies irreversible side effects before confirming bid-window creation

- Evidence:
  - Side effects happen before outcome validation: assignment `cancelType` update and metric increment execute before bid-window creation (`src/routes/api/cron/auto-drop-unconfirmed/+server.ts:84`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:91`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:99`).
  - `dropped++`, notification send, and audit log creation occur even when `createBidWindow(...)` returns `success: false` (`src/routes/api/cron/auto-drop-unconfirmed/+server.ts:102`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:107`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:116`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:129`).
  - `createBidWindow` can return failure for past shifts (`src/lib/server/services/bidding.ts:137`, `src/lib/server/services/bidding.ts:141`), which is a plausible path because the cron query has no upper bound on assignment date (`src/routes/api/cron/auto-drop-unconfirmed/+server.ts:56`).
- Impact: A retried or late run can repeatedly increment `autoDroppedShifts`, emit duplicate driver notifications, and inflate success counters without actually creating a recoverable bid window.
- Recommendation:
  - Wrap per-assignment operations in a transaction.
  - Gate metric update/notification/audit on `result.success`.
  - Add a terminal state guard (for example status or dedupe marker) when bid-window creation fails.

### HIGH - Workflow schedule drift from stated Toronto-time contract for critical jobs

- Evidence:
  - Workflow invokes `performance-check` at `0 1 * * *` (`.github/workflows/cron-jobs.yml:10`, `.github/workflows/cron-jobs.yml:57`), while route contract says daily at 1:00 AM Toronto (`src/routes/api/cron/performance-check/+server.ts:4`).
  - Workflow invokes `shift-reminders` at `0 6 * * *` (`.github/workflows/cron-jobs.yml:9`, `.github/workflows/cron-jobs.yml:56`), while route contract says daily at 6:00 AM Toronto (`src/routes/api/cron/shift-reminders/+server.ts:4`).
  - The project explicitly uses GitHub workflow schedules as the source of truth (`documentation/agent-guidelines.md:754`).
- Impact: Jobs run hours earlier than documented business timing, creating policy drift and potentially incorrect operational behavior (especially reminder/health windows).
- Recommendation: Align workflow schedules with Toronto-time intent (or update route/docs if current schedule is intentional).

### HIGH - Reminder cron endpoints are not idempotent under retries/manual re-runs

- Evidence:
  - `send-confirmation-reminders` sends per-assignment notifications without any dedupe check (`src/routes/api/cron/send-confirmation-reminders/+server.ts:63`, `src/routes/api/cron/send-confirmation-reminders/+server.ts:67`).
  - `shift-reminders` similarly sends per-assignment notifications without dedupe (`src/routes/api/cron/shift-reminders/+server.ts:89`, `src/routes/api/cron/shift-reminders/+server.ts:93`).
  - A dedupe pattern already exists elsewhere (`lock-preferences` checks existing notifications before sending, `src/routes/api/cron/lock-preferences/+server.ts:110`, `src/routes/api/cron/lock-preferences/+server.ts:121`).
- Impact: Any retry, replay, or manual recovery run can spam duplicate reminders and erode trust in notification relevance.
- Recommendation: Add deterministic dedupe keys (assignmentId + type + date/window) before sending.

### MEDIUM - Timeout budget is under-defined for high-volume loops and partially constrained by caller timeout

- Evidence:
  - GitHub caller sets `curl --max-time 60` (`.github/workflows/cron-jobs.yml:102`).
  - Several endpoints perform potentially large sequential loops with per-item DB/notification work (for example `auto-drop-unconfirmed`, `send-confirmation-reminders`, `shift-reminders`) (`src/routes/api/cron/auto-drop-unconfirmed/+server.ts:64`, `src/routes/api/cron/send-confirmation-reminders/+server.ts:63`, `src/routes/api/cron/shift-reminders/+server.ts:89`).
  - No explicit route-level runtime budget hints (`maxDuration`) were found under `src/routes/api/cron/`.
- Impact: At larger volumes, jobs risk partial execution and replay, compounding non-idempotent behavior.
- Recommendation: Introduce chunked processing with cursor/checkpoint semantics and explicit runtime budgeting per endpoint.

### MEDIUM - Expected rate-limit cron endpoint is missing (scope/spec drift)

- Evidence:
  - No rate-limit cron route exists under `src/routes/api/cron/`.
  - Workflow route resolution covers 9 cron routes only (`.github/workflows/cron-jobs.yml:52`, `.github/workflows/cron-jobs.yml:60`).
  - Rate-limit data exists in schema/migrations (`src/lib/server/db/auth-schema.ts:87`, `drizzle/0010_refresh_rate_limit_schema.sql:1`) but no cleanup/maintenance cron endpoint was found.
- Impact: If periodic cleanup/maintenance is expected for auth rate-limit records, it is currently unimplemented or undocumented.
- Recommendation: Either add the missing endpoint/job or explicitly document that no rate-limit cron is required.

### LOW - Observability schema is inconsistent across cron endpoints

- Evidence:
  - Some endpoints return flat counters (`close-bid-windows`, `auto-drop-unconfirmed`) (`src/routes/api/cron/close-bid-windows/+server.ts:83`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:139`).
  - Health endpoints return nested `summary` payloads (`src/routes/api/cron/health-daily/+server.ts:36`, `src/routes/api/cron/health-weekly/+server.ts:37`).
  - Completion logs vary in elapsed-time inclusion (`close-bid-windows` and `lock-preferences` lack explicit elapsedMs in final route response/log) (`src/routes/api/cron/close-bid-windows/+server.ts:78`, `src/routes/api/cron/lock-preferences/+server.ts:140`).
- Impact: Dashboarding and alert thresholds are harder to standardize across cron jobs.
- Recommendation: Standardize completion payload/log schema (`startedAt`, `elapsedMs`, `processed`, `succeeded`, `failed`, `skipped`).

## Checks Completed (No Immediate Defect Found)

- All audited cron routes enforce `Authorization: Bearer <CRON_SECRET>` checks before core processing (`src/routes/api/cron/*/+server.ts`).
- Error isolation is generally present at item/batch level for heavy jobs (`close-bid-windows`, `auto-drop-unconfirmed`, `no-show-detection`, `performance-check`, `shift-reminders`, `send-confirmation-reminders`).
- No-show timing protection is DST-aware by combining dual UTC schedule entries with in-service Toronto deadline guard (`.github/workflows/cron-jobs.yml:7`, `src/lib/server/services/noshow.ts:76`).
- Preference-lock flow contains explicit dedupe for assignment-confirmed notifications by week window (`src/routes/api/cron/lock-preferences/+server.ts:110`, `src/routes/api/cron/lock-preferences/+server.ts:121`).

## Priority Fix Order

1. Fix `auto-drop-unconfirmed` transactional/idempotency defect so side effects occur only after successful bid-window creation.
2. Align cron schedules with intended Toronto-time business windows (or update contracts to match actual schedule).
3. Add idempotency guards to reminder endpoints (`send-confirmation-reminders`, `shift-reminders`).
4. Add runtime budgeting/chunking for long-running loops and standardize replay-safe checkpoints.
5. Resolve rate-limit cron scope drift (implement or document explicit non-requirement).
6. Normalize cron observability schema for consistent alerts and incident triage.
