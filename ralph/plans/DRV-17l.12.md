# DRV-17l.12: Repair health service policy and migration drift

Task: `DRV-17l.12`
Parent: `DRV-17l`
Status: Drafted for execution

## 1) Goal and scope

Address all findings from `logs/nightly/2026-02-10/audit-services-health.md` for the health service by:

1. Ensuring hard-stop late-cancel logic only counts true late cancellations (`cancelType='late'`).
2. Shipping a forward-safe SQL migration for health columns used by runtime but missing from committed migrations.
3. Aligning documented scoring semantics with current additive implementation.
4. Persisting real snapshot rates instead of placeholder zero values.
5. Making hard-stop reset timing consistent across daily/event paths and preventing stale daily overwrites.

Out of scope for this bead:

- Replacing additive scoring with a brand-new weighted 50/30/20 engine.
- UI redesign of the health card.
- New manager workflows beyond current reinstate behavior.

## 2) Key findings mapped to code

From `audit-services-health.md`:

1. Late-cancel hard-stop queries currently overcount confirmed cancellations.
2. Migrations do not include `driver_health_state.reinstated_at`, `driver_health_state.last_score_reset_at`, or `driver_health_snapshots.contributions`.
3. Snapshot `attendanceRate` and `completionRate` are currently persisted as `0`.
4. Daily hard-stop path does not immediately reset stars/streak like no-show path.
5. Daily write can race with event-driven resets and overwrite newer state.

## 3) Implementation decisions

1. Keep additive point scoring as implementation truth for now, and update docs that still describe weighted 50/30/20 internals.
2. Persist snapshot rates from `driver_metrics` (`attendanceRate`, `completionRate`) during daily evaluation.
3. On daily hard-stop activation, reset stars/streak immediately and set `lastScoreResetAt` when entering hard-stop.
4. Add stale-write protection using `lastScoreResetAt` as a reset marker:
   - compute captures observed reset marker,
   - persist verifies marker is unchanged,
   - batch runner recomputes/retries once if stale.
5. Add immutable `assignments.cancelledAt` and use it for post-reinstatement late-cancel event detection (instead of mutable `updatedAt`).

## 4) Workstreams

### Workstream A - Hard-stop late-cancel correctness

Update all health queries that represent late cancellations to include `cancelType='late'`:

1. `getRollingCounts` in `src/lib/server/services/health.ts`
2. `hasNewHardStopEvents` in `src/lib/server/services/health.ts`
3. Weekly late-cancel count in `evaluateWeek` in `src/lib/server/services/health.ts`

Expected outcome: on-time cancellations are never treated as hard-stop late cancels.

### Workstream B - Forward migration for schema drift

Add a new migration (`drizzle/0012_*.sql`) that safely adds missing columns with `IF NOT EXISTS`:

1. `driver_health_state.reinstated_at` (timestamptz)
2. `driver_health_state.last_score_reset_at` (timestamptz)
3. `driver_health_snapshots.contributions` (jsonb)
4. `assignments.cancelled_at` (timestamptz) with backfill from `updated_at` for already-cancelled rows.

Expected outcome: clean DB bootstrap from migrations supports current runtime queries and writes.

### Workstream C - Daily persistence consistency and race safety

In `src/lib/server/services/health.ts`:

1. Extend daily score computation to carry:
   - `attendanceRate`,
   - `completionRate`,
   - observed `lastScoreResetAt` marker.
2. Persist real snapshot rates (replace placeholder zeros).
3. When hard-stop is active and should disable pool, immediately reset:
   - `stars=0`,
   - `streakWeeks=0`,
   - `nextMilestoneStars=1`.
4. Add stale-write guard before daily write:
   - read current `lastScoreResetAt`,
   - abort write if marker changed since compute,
   - retry compute+persist once in batch runner.

Expected outcome: no stale overwrite of post-reset state; hard-stop reset timing matches event path behavior.

### Workstream D - Documentation alignment

Update docs that still describe weighted internals as current implementation behavior.

Primary targets:

1. `documentation/agent-guidelines.md` (health function notes)
2. `documentation/plans/driver-health-gamification.md` (implementation status notes for scoring semantics)

Expected outcome: docs accurately describe additive scoring runtime and no longer imply a weighted engine is implemented.

### Workstream E - Tests and validation

1. Update/add Vitest coverage in `tests/server/healthPolicyService.test.ts` for changed contract where needed.
2. Run focused tests first, then broader gates:
   - `pnpm test -- tests/server/healthPolicyService.test.ts`
   - `pnpm check`

Expected outcome: deterministic proof for hard-stop policy behavior and no type regressions.

## 5) Acceptance criteria mapping

1. **Health cron/service runs on clean migrated DB**
   - Proven by forward migration adding missing health columns.
2. **Late-cancel hard-stop applies only to true late cancels**
   - Proven by query predicate changes (`cancelType='late'`).
3. **Score/stars reset behavior consistent across paths**
   - Proven by immediate daily hard-stop star/streak reset and aligned reset marker behavior.
4. **Scoring model and docs aligned**
   - Proven by doc updates to additive semantics and removal of weighted-as-implemented wording.

## 6) Validation commands

```bash
pnpm test -- tests/server/healthPolicyService.test.ts
pnpm check
```

If health-adjacent tests fail, run targeted suites and fix source behavior first before adjusting tests.
