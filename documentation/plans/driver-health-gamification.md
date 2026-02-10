# Driver Health Gamification (Interview Spec)

Task: Introduce a driver-facing health system that incentivizes reliability and quality with transparent scoring, streak stars, and bonus/cap simulation.

## Problem

The current driver dashboard gives large visual priority to raw metrics (`attendance`, `completion`, total/completed shifts), but does not clearly connect those numbers to outcomes that matter to drivers or managers.

Managers care about operational continuity first: a driver must show up and complete routes. Drivers need transparent guidance on what behaviors unlock better opportunities.

## Existing Foundation (Already in Code)

1. `dispatchPolicy` centralizes reliability and reward constants (`src/lib/config/dispatchPolicy.ts`).
2. Attendance/completion metrics are computed in `updateDriverMetrics` (`src/lib/server/services/metrics.ts`).
3. No-shows and late cancellations are tracked in `driver_metrics` (`src/lib/server/db/schema.ts`).
4. Attendance-based flagging and cap adjustment already exist (`src/lib/server/services/flagging.ts`).
5. Manager-side health states already exist (`flagged`, `at_risk`, `watch`, `healthy`, `high_performer`) in `/api/drivers`.

Gap: there is no driver-facing aggregate health score + progression UX + streak/milestone model.

## Product Decisions (Locked via Interview)

1. **Primary objective**: behavior incentive.
2. **V1 scope**: UI + simulation only (no automated pay/cap changes yet).
3. **Shift pickup terminology**: `Open Shifts` + `Place Bid`.
4. **Score UX**: 0-100 score + 0-4 stars.
5. **State source of truth**: server-side persisted snapshots/state.
6. **Demotion**: immediate reset to 0 stars on hard-stop event.
7. **Hard-stop weekly score behavior**: cap score to 49 for impacted period.
8. **Cadence**: daily score updates, weekly star progression updates.
9. **Qualifying week**: 100% attendance, completion >= 95%, 0 no-shows, 0 late cancellations.
10. **No-assignment week**: neutral (does not increment or reset streak).
11. **Late cancellation definition**: <= 48h before shift.
12. **Late-cancel hard stop threshold**: 2 late cancellations in rolling 30 days.
13. **Pool removal rule**: 1 no-show OR threshold late-cancel event removes from assignment pool.
14. **Reinstatement**: manager intervention only (manual unflag/reinstate).
15. **Progress bar reference marker**: elite threshold marker (not fleet average in v1).
16. **Bonus simulation**: single unlock at 4 stars = +10% previewed bonus.
17. **Messaging placement**: dashboard health card + notifications.

## Scope

### In Scope (V1)

1. Driver-facing Health card replaces current high-emphasis raw-metrics block.
2. 0-100 health score with threshold marker and explanatory breakdown.
3. 0-4 star weekly streak system with immediate hard-stop reset behavior.
4. Simulation-only incentive preview (4 stars => +10% bonus, higher shift access preview).
5. Daily/weekly health evaluation pipeline using server-side persisted state.
6. Notification updates for milestone gained, streak reset, and next target guidance.

### Out of Scope (V1)

1. Automatic wage or payroll changes.
2. Automatic weekly-cap mutation from health card outcomes.
3. New manager moderation workflows beyond existing unflag/reinstate path.
4. Full dispatch engine rewrite.

## Proposed Health Model

### 1) Daily Score (0-100)

Use reliability-first weighting with hard-stop caps:

```txt
base_score = attendance_component (50)
           + completion_component (30)
           + reliability_component (20)

hard-stop cap: if no-show OR late-cancel threshold breach -> score = min(base_score, 49)
```

Policy overlays:

1. Completion < 80% enters corrective state.
2. Corrective state has 1-week recovery window before punitive cap policy is suggested.
3. Hard-stop events override all positives for that evaluation period.

### 2) Weekly Stars (0-4)

1. Week qualifies only if strict criteria pass.
2. Qualifying week increments streak by +1 (max 4).
3. Any hard-stop event resets streak to 0 immediately.
4. Weeks with zero assignments are neutral (no increment/no reset).

### 3) Incentive Preview (Simulation)

1. Show milestone reward preview: 4 stars => +10%.
2. Show operational preview: higher assignment access tier (e.g., 4 -> 6 days/week) as projected outcome.
3. Label clearly as simulation (not yet automatically applied).

## Technical Design

### Data Model Additions

Add persistent health state tables (names indicative):

1. `driver_health_snapshot` (daily):
   - `userId`
   - `evaluatedAt`
   - `score`
   - `attendanceRate`
   - `completionRate`
   - `lateCancellationCount30d`
   - `noShowCount30d`
   - `hardStopTriggered`
   - `reasons[]`

2. `driver_health_state` (current):
   - `userId`
   - `currentScore`
   - `streakWeeks`
   - `stars`
   - `lastQualifiedWeekStart`
   - `assignmentPoolEligible`
   - `requiresManagerIntervention`
   - `nextMilestoneStars`
   - `updatedAt`

### Evaluation Jobs

1. Extend daily performance check cron:
   - recompute metrics
   - compute daily score
   - persist snapshot + current state

2. Add weekly close step:
   - evaluate qualifying-week status
   - increment/reset stars
   - emit milestone/reset notifications

### API Surface

1. Add `GET /api/driver-health` returning:
   - current score
   - stars/streak
   - threshold marker value
   - hard-stop flags/reasons
   - next milestone info
   - simulation rewards

2. Keep existing `/api/dashboard` payload lightweight; health card can load from dedicated endpoint or expanded dashboard payload.

### UI Surface (Driver Dashboard)

1. Replace the large raw-metrics emphasis with a Health card.
2. Include:
   - score bar with elite threshold marker
   - star progression row (0-4)
   - concise status summary
   - transparent factor breakdown
   - next-milestone guidance
3. Keep raw metrics available as low-emphasis detail (collapsible or compact row).

### Notifications

Add/extend driver notifications for:

1. Weekly streak advanced.
2. Streak reset + reason.
3. Bonus eligibility reached (simulation).
4. Corrective state warning (completion below 80%).

## Edge Cases

1. New driver with no shifts yet -> neutral onboarding state, no punitive messaging.
2. Zero-assignment week -> neutral streak effect.
3. Backfilled metric changes -> recomputation should be idempotent.
4. Manual manager unflag should synchronize `assignmentPoolEligible` state.
5. Concurrent events (cancel + no-show processing) should not double-penalize a single shift event.

## Security & Governance

1. Health evaluation runs server-side only.
2. Driver-facing API is read-only and authenticated.
3. State transitions should be audit-logged (especially pool removal / reinstatement flags).
4. Simulation language must avoid implying immediate compensation changes.

## Acceptance Criteria (V1)

1. Driver dashboard shows a health score (0-100) and star progression (0-4).
2. Hard-stop events cap score to <=49 and reset stars to 0.
3. Weekly qualification uses strict criteria exactly as defined.
4. Weeks with zero assignments are neutral.
5. Health state is persisted server-side and survives reload/device changes.
6. Driver sees transparent score breakdown and next milestone guidance.
7. Notifications emit for streak progress/reset/milestone events.
8. No automatic payroll/cap mutation occurs in v1.

## Suggested Decomposition

1. Data model + migration for health snapshot/state.
2. Scoring engine + weekly evaluator service.
3. API endpoint + notification integration.
4. Dashboard health card UI + i18n copy.
5. Regression tests + policy edge-case tests.
