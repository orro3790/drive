# DRV-5yr Nightly Audit - Scheduling, Confirmations, and No-Show Services

Date: 2026-02-10
Task: DRV-5yr

## Scope

- `src/lib/server/services/scheduling.ts`
- `src/lib/server/services/confirmations.ts`
- `src/lib/server/services/noshow.ts`
- Integration checkpoints reviewed for pipeline behavior:
  - `src/routes/api/cron/lock-preferences/+server.ts`
  - `src/routes/api/cron/auto-drop-unconfirmed/+server.ts`
  - `src/routes/api/preferences/+server.ts`
  - `.github/workflows/cron-jobs.yml`
  - `documentation/specs/SPEC.md`
  - `tests/server/schedulingService.test.ts`
  - `tests/server/confirmationsService.test.ts`
  - `tests/server/noShowDetectionService.test.ts`
  - `tests/server/cronAutoDropUnconfirmedApi.test.ts`
  - `tests/server/cronLockPreferencesApi.test.ts`

## Findings Summary

- Critical: 2
- High: 2
- Medium: 1
- Low: 0

## Findings

### 1) CRITICAL - Date conversion approach can shift week/day boundaries and deadline instants

- Evidence:
  - Scheduling week/date derivation uses `toZonedTime(...)` + `startOfDay(...)` + formatted date strings (`src/lib/server/services/scheduling.ts:28`, `src/lib/server/services/scheduling.ts:34`, `src/lib/server/services/scheduling.ts:40`, `src/lib/server/services/scheduling.ts:95`, `src/lib/server/services/scheduling.ts:168`).
  - Confirmation windows are based on `parseISO(date)` then `toZonedTime(...)` and `set(...)` (`src/lib/server/services/confirmations.ts:25`, `src/lib/server/services/confirmations.ts:27`, `src/lib/server/services/confirmations.ts:47`, `src/lib/server/services/confirmations.ts:50`).
  - Auto-drop 48h cutoff uses the same pattern (`src/routes/api/cron/auto-drop-unconfirmed/+server.ts:66`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:67`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:68`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:74`).
- What happens:
  - Date-only values (`YYYY-MM-DD`) are converted through runtime-local `Date` math, then compared in Toronto-adjusted wall-clock objects. This can produce off-by-one-day week/date boundaries and distorted hours-until-shift math depending on host timezone/runtime assumptions.
- Impact:
  - Core checkpoints in this bead (2-week targeting, 7d-to-48h confirmation boundaries, and DST correctness) become non-deterministic and may execute on the wrong local day/hour.
- Recommendation:
  - Build Toronto instants explicitly from date components (for example `fromZonedTime(`${date}T07:00:00`, 'America/Toronto')`) and use `formatInTimeZone` for serialization/queries; add DST and timezone-host regression tests.

### 2) CRITICAL - Auto-drop applies penalties and reports drops even when bid-window creation fails

- Evidence:
  - Side effects (assignment cancel type flag, metric increment, user notification, audit log, `dropped++`) execute regardless of `createBidWindow` success (`src/routes/api/cron/auto-drop-unconfirmed/+server.ts:84`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:91`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:99`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:102`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:107`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:116`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:129`).
  - `createBidWindow` can legitimately return failure (`src/lib/server/services/bidding.ts:191`, `src/lib/server/services/bidding.ts:199`).
- What happens:
  - A driver can be penalized/notified as auto-dropped without a replacement window being opened, violating the intended "48h auto-drop -> bid window" pipeline.
- Impact:
  - Production consistency risk: assignment lifecycle, metrics, and communications can diverge from actual replacement-state.
- Recommendation:
  - Make auto-drop transactional/idempotent: only commit drop side effects after successful window creation (or explicitly compensate/rollback on failure).

### 3) HIGH - Sunday 23:59 lock semantics are bypassable in current lock-state check

- Evidence:
  - Lock cron writes `lockedAt` to the current-cycle Sunday deadline (`src/routes/api/cron/lock-preferences/+server.ts:33`, `src/routes/api/cron/lock-preferences/+server.ts:38`, `src/routes/api/cron/lock-preferences/+server.ts:51`, `src/routes/api/cron/lock-preferences/+server.ts:71`).
  - Preferences API marks lock active only if `lockedAt >= getNextLockDeadline()` (`src/routes/api/preferences/+server.ts:56`, `src/routes/api/preferences/+server.ts:60`, `src/routes/api/preferences/+server.ts:63`).
  - Scheduling consumes all current preferences without lock-cycle filtering (`src/lib/server/services/scheduling.ts:122`, `src/lib/server/services/scheduling.ts:123`).
- What happens:
  - Immediately after lock, `lockedAt` is earlier than the next Sunday deadline, so updates can be accepted during what should be a frozen cycle.
- Impact:
  - "Preferences lock Sunday 23:59 Toronto" checkpoint is not reliably enforced end-to-end.
- Recommendation:
  - Evaluate lock state against the active cycle boundary (or explicit target-week key), not the next upcoming deadline.

### 4) HIGH - Unfilled slots from schedule generation do not auto-open bid windows (spec drift)

- Evidence:
  - Scheduler writes unfilled assignments but does not call bidding service (`src/lib/server/services/scheduling.ts:273`, `src/lib/server/services/scheduling.ts:282`, `src/lib/server/services/scheduling.ts:307`).
  - Lock-preferences cron only invokes schedule generation and notifications (`src/routes/api/cron/lock-preferences/+server.ts:77`, `src/routes/api/cron/lock-preferences/+server.ts:92`).
  - Spec expects bid windows for no-eligible-driver outcomes (`documentation/specs/SPEC.md:95`, `documentation/specs/SPEC.md:111`, `documentation/specs/SPEC.md:115`).
- What happens:
  - Route-day slots marked `unfilled` at generation time can remain without a window unless another flow opens one later.
- Impact:
  - Coverage recovery is delayed or manual, reducing dispatch resilience.
- Recommendation:
  - Trigger `createBidWindow(..., { trigger: '...schedule_unfilled...' })` for scheduler-created unfilled assignments, with idempotency guard.

### 5) MEDIUM - No-show "by 9:00:00" enforcement depends on cron run timing, not explicit arrival cutoff comparison

- Evidence:
  - No-show candidate filter uses `arrivedAt IS NULL` rather than `arrivedAt > deadline` (`src/lib/server/services/noshow.ts:125`, `src/lib/server/services/noshow.ts:126`).
  - Service only gates execution by current time (`src/lib/server/services/noshow.ts:76`, `src/lib/server/services/noshow.ts:77`).
  - Job schedule is dual-slot UTC for DST bridging (`.github/workflows/cron-jobs.yml:7`, `.github/workflows/cron-jobs.yml:54`).
- What happens:
  - If execution is delayed after 9:00 and a driver arrives late before the job runs, they may escape no-show classification because `arrivedAt` is no longer null.
- Impact:
  - "Exactly 9:00:00" policy can drift in delayed-run scenarios.
- Recommendation:
  - Compare arrival timestamp against an explicit 9:00 Toronto deadline (`arrivedAt IS NULL OR arrivedAt > deadline`) rather than runtime-null-only detection.

## Checks Completed (No Immediate Defect Found)

- Preference matching/ranking logic is present: day preference, route preference, weekly cap, and non-flagged filtering plus deterministic tie-break order (`src/lib/server/services/scheduling.ts:190`, `src/lib/server/services/scheduling.ts:196`, `src/lib/server/services/scheduling.ts:201`, `src/lib/server/services/scheduling.ts:215`).
- Confirmation window enforcement is inclusive at boundaries in service logic (`src/lib/server/services/confirmations.ts:105`, `src/lib/server/services/confirmations.ts:109`, `src/lib/server/services/confirmations.ts:187`) and mirrored in lifecycle tests (`tests/server/assignmentLifecycle.test.ts:74`, `tests/server/assignmentLifecycle.test.ts:77`).
- No-show flow includes idempotency protection via existing open-window check (`src/lib/server/services/noshow.ts:108`, `src/lib/server/services/noshow.ts:136`) and dual-run intent for DST (`.github/workflows/cron-jobs.yml:7`).

## Checkpoint Matrix

| Required checkpoint                            | Status  | Evidence                                                                                                                                                                                     | Notes                                                                               |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2-week lookahead                               | PARTIAL | `src/routes/api/cron/lock-preferences/+server.ts:53`                                                                                                                                         | Intent exists (`+2 weeks`), but date-boundary math is impacted by Finding #1.       |
| Preference matching                            | PASS    | `src/lib/server/services/scheduling.ts:190`, `src/lib/server/services/scheduling.ts:196`, `src/lib/server/services/scheduling.ts:201`, `src/lib/server/services/scheduling.ts:215`           | Required filters and ranking are implemented.                                       |
| Toronto/Eastern timezone handling              | FAIL    | `src/lib/server/services/scheduling.ts:28`, `src/lib/server/services/confirmations.ts:25`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:66`                                         | Runtime-dependent date conversion pattern risks shifted boundaries.                 |
| DST transitions (confirmation + no-show)       | FAIL    | `src/lib/server/services/confirmations.ts:47`, `src/lib/server/services/noshow.ts:76`, `tests/server/confirmationsService.test.ts:95`, `tests/server/noShowDetectionService.test.ts:154`     | DST handling is intended, but coverage and date math are insufficiently robust.     |
| Confirmation window boundaries (7 days to 48h) | PARTIAL | `src/lib/server/services/confirmations.ts:49`, `src/lib/server/services/confirmations.ts:50`, `src/lib/server/services/confirmations.ts:105`, `src/lib/server/services/confirmations.ts:109` | Inclusive checks exist, but boundary instants are impacted by Finding #1.           |
| Auto-drop at 48h triggers bid window           | FAIL    | `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:74`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:99`, `src/routes/api/cron/auto-drop-unconfirmed/+server.ts:102`             | 48h math and trigger coupling are not reliable (Findings #1 and #2).                |
| No-show detection at exactly 9:00:00           | PARTIAL | `src/lib/server/services/noshow.ts:76`, `src/lib/server/services/noshow.ts:77`, `src/lib/server/services/noshow.ts:126`                                                                      | Pre-9 gate exists, but late-execution semantics can miss cutoff violations.         |
| Preference lock Sunday 23:59 Toronto           | FAIL    | `src/routes/api/cron/lock-preferences/+server.ts:38`, `src/routes/api/preferences/+server.ts:63`                                                                                             | Lock timestamp and lock-check comparator are misaligned (Finding #3).               |
| New-driver scheduling wait                     | PARTIAL | `documentation/specs/SPEC.md:100`, `src/routes/api/cron/lock-preferences/+server.ts:53`                                                                                                      | N+2 model implies wait, but lock/date defects reduce confidence in strict behavior. |

## Priority Fix Order

1. Normalize all schedule/confirmation/auto-drop date-time construction to explicit Toronto instants and add DST boundary regression tests.
2. Fix auto-drop transaction semantics so penalties, notifications, and audit records only occur when a replacement bid window is successfully opened.
3. Correct lock-state evaluation to enforce Sunday 23:59 freeze for the active cycle.
4. Open bid windows automatically for scheduler-generated unfilled assignments.
5. Make no-show cutoff evaluation compare arrival timestamps against an explicit 9:00 Toronto deadline.
