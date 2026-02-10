# DRV-65e Nightly Audit - Health Service

Date: 2026-02-10
Scope:

- `src/lib/server/services/health.ts`

## Executive Summary

- Reviewed daily scoring, weekly star progression, hard-stop enforcement, pool eligibility transitions, simulation signaling dependencies, and cron batch execution behavior.
- Confirmed some core policy mechanics are present (new-driver daily skip, hard-stop score cap at 49, zero-assignment neutral weeks, star ceiling enforcement).
- Found 2 critical, 2 high, and 1 medium issue that should be resolved before production hardening.

## Findings

### 1) CRITICAL - Late-cancel hard-stop logic counts all confirmed cancellations, not only late cancellations

- **Evidence:** `src/lib/server/services/health.ts:77`, `src/lib/server/services/health.ts:78`, `src/lib/server/services/health.ts:119`, `src/lib/server/services/health.ts:120`, `src/lib/server/services/health.ts:617`, `src/lib/server/services/health.ts:618`
- **What happens:** Rolling and weekly hard-stop queries identify late cancellations via `status = 'cancelled'` + `confirmedAt IS NOT NULL`, but do not filter `cancelType = 'late'`.
- **Impact:** On-time confirmed cancellations can be misclassified as late cancellations, triggering false hard-stop outcomes (score cap, star reset path, pool removal state).
- **Recommendation:** Apply a consistent `cancelType = 'late'` predicate in all late-cancellation hard-stop queries (`getRollingCounts`, `hasNewHardStopEvents`, and weekly late-cancel count).

### 2) CRITICAL - Service uses health columns not present in committed SQL migrations

- **Evidence:** `src/lib/server/services/health.ts:148`, `src/lib/server/services/health.ts:391`, `src/lib/server/services/health.ts:415`, `src/lib/server/services/health.ts:421`, `drizzle/0006_bizarre_spencer_smythe.sql:5`, `drizzle/0006_bizarre_spencer_smythe.sql:20`
- **What happens:** Runtime code reads/writes `driver_health_state.reinstated_at`, `driver_health_state.last_score_reset_at`, and `driver_health_snapshots.contributions`, but the migration that creates these tables does not include those columns.
- **Impact:** Fresh environments created from committed migrations are at risk of runtime query/update failures when health jobs execute.
- **Recommendation:** Add and ship a forward migration that introduces missing columns (with safe defaults/backfill strategy), then validate health cron paths against a clean migrated database.

### 3) HIGH - Score implementation diverges from required 0-100 (50/30/20) model and leaves snapshot rates unset

- **Evidence:** `documentation/plans/driver-health-gamification.md:65`, `documentation/plans/driver-health-gamification.md:71`, `src/lib/server/services/health.ts:293`, `src/lib/server/services/health.ts:305`, `src/lib/server/services/health.ts:385`, `src/lib/server/services/health.ts:398`
- **What happens:** Daily score is calculated as an additive event-point sum with floor-at-zero only; no 0-100 normalization or 50/30/20 component math is implemented. Snapshot `attendanceRate`/`completionRate` are persisted as `0`.
- **Impact:** Boundary expectations around 0/49/50/100 and weighted component explainability cannot be validated against current implementation, and stored snapshot rates are not trustworthy.
- **Recommendation:** Either (a) implement the documented weighted 0-100 model and persist real rates, or (b) update product/spec/contracts to additive semantics and remove stale weighted-language requirements.

### 4) HIGH - Late-cancel hard-stop does not immediately reset stars, causing stale progression/simulation state

- **Evidence:** `src/lib/server/services/health.ts:408`, `src/lib/server/services/health.ts:449`, `src/lib/server/services/health.ts:535`, `src/lib/server/services/health.ts:538`, `src/routes/api/driver-health/+server.ts:115`, `src/lib/server/services/noshow.ts:169`
- **What happens:** Daily hard-stop persistence updates score/pool flags but does not reset `stars`/`streakWeeks`; reset occurs in weekly evaluation. No-show path does immediate reset via separate service, creating inconsistent hard-stop timing behavior.
- **Impact:** A driver can remain on stale high-star state (and simulation bonus eligibility derived from stars) after a late-cancel hard-stop until weekly cron runs.
- **Recommendation:** Apply immediate, idempotent star/streak reset in the daily hard-stop path (or in late-cancel event handling) so hard-stop behavior is consistent across trigger types.

### 5) MEDIUM - Daily evaluation has a stale-write window against concurrent event-driven resets

- **Evidence:** `src/lib/server/services/health.ts:806`, `src/lib/server/services/health.ts:813`, `src/lib/server/services/noshow.ts:170`, `src/lib/server/services/noshow.ts:173`
- **What happens:** Daily run computes score, then persists later; in between, no-show flow can reset score/state. The subsequent daily upsert can overwrite `currentScore` with pre-reset data.
- **Impact:** Persisted score can temporarily diverge from current hard-stop reality, producing confusing API/UI output and audit trails.
- **Recommendation:** Add optimistic concurrency protection (for example, guard updates on `lastScoreResetAt`/`updatedAt`), or recompute before write when reset markers changed.

## Checks Completed (No Immediate Defect Found)

- **Hard-stop score cap:** Daily score is capped at 49 when hard-stop is active (`src/lib/server/services/health.ts:360`).
- **New-driver handling:** Drivers with zero historical shifts return `null` daily score and are skipped by scorer (`src/lib/server/services/health.ts:337`).
- **Zero-assignment week neutrality:** Weekly evaluation treats empty weeks as neutral without streak/star mutation (`src/lib/server/services/health.ts:514`).
- **Star ceiling enforcement:** Weekly star increment is clamped at configured max stars (`src/lib/server/services/health.ts:649`).

## Priority Fix Order

1. Correct late-cancel hard-stop filters to avoid false punitive actions.
2. Ship missing health-schema migration columns and validate on clean DB.
3. Align scoring model/spec and persist non-placeholder snapshot rates.
4. Make hard-stop reset timing consistent and immediate across trigger types.
5. Add stale-write guards for daily-vs-event concurrency.
