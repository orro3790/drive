# Health, Scoring & Automation Quick Reference

Single-page reference for the driver health system, automated cron jobs, and how they interconnect. For full implementation details, see the source files linked in each section.

---

## Scoring Model Overview

The health system is an **additive point-based model** — not a weighted average. Points accumulate since the driver's last score reset (`lastScoreResetAt`). Score is floored at 0 (never negative).

**Source**: `src/lib/server/services/health.ts`
**Config**: `src/lib/config/dispatchPolicy.ts` → `health`

---

## Point Values

### Positive Events (per occurrence)

| Event                             | Points | Trigger                                                                     |
| --------------------------------- | ------ | --------------------------------------------------------------------------- |
| Confirmed on time                 | +1     | Driver confirms shift within window                                         |
| Arrived on time                   | +2     | `arrivedAt` < route's `startTime`                                           |
| Completed shift                   | +2     | Shift marked complete (`completedAt` set)                                   |
| High delivery (95%+)              | +1     | `(parcelsStart - parcelsReturned + exceptedReturns) / parcelsStart >= 0.95` |
| Bid pickup (competitive)          | +2     | Won a competitive-mode bid                                                  |
| Urgent pickup (instant/emergency) | +4     | Won an instant or emergency bid                                             |

### Negative Events (per occurrence)

| Event                         | Points | Trigger                                       |
| ----------------------------- | ------ | --------------------------------------------- |
| Auto-drop (failed to confirm) | -12    | 48h deadline passed without confirmation      |
| Early cancellation            | -8     | Driver-initiated cancel (>48h before start)   |
| Late cancellation             | -32    | Confirmed shift cancelled within 48h of start |

### No-Show (special)

No-show is **not a point deduction** — it's a **full reset**:

- Score → 0
- Stars → 0
- Streak → 0
- `assignmentPoolEligible` → false
- `requiresManagerIntervention` → true
- `lastScoreResetAt` → now

---

## Maximum Daily Points

Theoretical max for one shift day (all bonuses):

```
Confirm on time:        +1
Arrive on time:         +2
Complete shift:         +2
High delivery (95%+):   +1
Bid pickup (competitive): +2
────────────────────────────
MAXIMUM PER DAY:        +8 points
```

Urgent pickup replaces bid pickup for +4 instead of +2 (max +10 in that scenario, but rare).

---

## Hard-Stop Conditions

**Trigger** (either one):

1. **1+ no-show** in rolling 30 days
2. **2+ late cancellations** in rolling 30 days

**Effects**:

- Score capped at **49** (below Tier II threshold of 96)
- Stars reset to 0, streak reset to 0
- Removed from assignment pool
- Requires manager intervention to reinstate

**Duration**: Persists until manager manually reinstates. If new hard-stop events occur after reinstatement, driver is automatically re-locked.

**Source**: `health.ts:computeDailyScore()` → `getRollingCounts()` → `persistDailyScore()`

---

## Tier System

| Tier | Score Range | Meaning                                   |
| ---- | ----------- | ----------------------------------------- |
| I    | 0–95        | Standard                                  |
| II   | 96+         | Elite (~1 perfect month at 4 shifts/week) |

Tier II threshold (96) = 4 shifts/week × 4 weeks × 6 pts/shift (confirm + arrive + complete + high delivery + no penalties).

Used in bid scoring: `health = min(score / 96, 1)`.

---

## Star Progression (Weekly)

Evaluated every Monday for the previous Mon–Sun week.

### Qualifying Week Criteria (ALL must pass)

| Criterion          | Threshold                       |
| ------------------ | ------------------------------- |
| Attendance         | 100% (no cancelled assignments) |
| Completion rate    | 95%+ (adjusted for exceptions)  |
| No-shows           | 0                               |
| Late cancellations | 0                               |

### Progression Rules

| Scenario             | Stars               | Streak              |
| -------------------- | ------------------- | ------------------- |
| Qualifying week      | +1 star (max 4)     | +1 week             |
| Non-qualifying week  | Unchanged           | Unchanged           |
| Hard-stop triggered  | Reset to 0          | Reset to 0          |
| Zero-assignment week | Unchanged (neutral) | Unchanged (neutral) |

### 4-Star Milestone

At 4 stars: UI shows "+10% bonus preview" (V1 simulation only, no payroll effect).

---

## Metrics Calculation

**Source**: `src/lib/server/services/metrics.ts`

| Metric          | Formula                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| Attendance rate | `completedShifts / totalShifts`                                          |
| Completion rate | `avg((parcelsStart - parcelsReturned + exceptedReturns) / parcelsStart)` |

- **Attendance**: Any assignment without a completed shift counts as a miss (cancel, auto-drop, no-show)
- **Completion**: Only calculated for shifts where `completedAt IS NOT NULL` and `parcelsStart > 0`
- **Exceptions**: `exceptedReturns` (holidays, closures) do NOT count against completion rate

**Recalculation triggers**:

- After shift completion (`POST /api/shifts/complete`)
- After shift edit (`PATCH /api/shifts/[id]/edit`)
- Daily performance-check cron (recalculates all drivers)

---

## Flagging System

**Source**: `src/lib/server/services/flagging.ts`

| Rule                | Threshold                                  |
| ------------------- | ------------------------------------------ |
| Before 10 shifts    | Flag if attendance < 80%                   |
| After 10 shifts     | Flag if attendance < 70%                   |
| Grace period        | 7 days to improve                          |
| Penalty after grace | -1 day from weekly cap (min 1)             |
| Reward              | 20+ shifts AND 95%+ attendance → 6-day cap |

**Flagged drivers**: Cannot receive scheduled assignments, cannot bid, cannot be manually assigned.

**Note**: Flagging and health scoring are **separate systems**. Flagging uses attendance rate only. Health scoring uses the point system.

---

## Automated Systems (Cron Jobs)

### Timeline (all times UTC → Toronto equivalent)

| UTC          | Toronto (EST)  | Job                                  | Frequency             |
| ------------ | -------------- | ------------------------------------ | --------------------- |
| 01:00        | 20:00 prev day | Performance check & flagging         | Daily                 |
| 07:00        | 02:00          | Daily health evaluation              | Daily                 |
| 08:00 Mon    | 03:00 Mon      | Weekly health evaluation             | Weekly (Monday)       |
| 04:59 Mon    | 23:59 Sun      | Lock preferences & generate schedule | Weekly (Sunday night) |
| 10:00, 11:00 | 05:00, 06:00   | Shift reminders                      | Daily (2x for DST)    |
| 10:05, 11:05 | 05:05, 06:05   | Confirmation reminders               | Daily (2x for DST)    |
| 13:00, 14:00 | 08:00, 09:00   | No-show detection                    | Daily (2x for DST)    |
| \*/15 min    | \*/15 min      | Close bid windows                    | Every 15 minutes      |
| 0 \* \* \*   | 0 \* \* \*     | Auto-drop unconfirmed shifts         | Hourly                |
| 0 \* \* \*   | 0 \* \* \*     | Stale shift reminders                | Hourly                |

### Dependency Order

```
Performance check (01:00 UTC)     ← metrics must be fresh
    ↓
Daily health evaluation (07:00)   ← uses fresh metrics
    ↓
Weekly health evaluation (08:00 Mon) ← uses daily snapshots
```

### Job Details

#### 1. Performance Check & Flagging

- **Endpoint**: `GET /api/cron/performance-check`
- **Does**: Recalculates `driverMetrics` for all drivers, applies flagging rules
- **Sends**: Warning notification to newly flagged drivers
- **Broadcasts**: SSE event to managers when driver flagged

#### 2. Daily Health Evaluation

- **Endpoint**: `GET /api/cron/health-daily`
- **Does**: Computes health score for all drivers, persists snapshots, detects hard-stops
- **Sends**: `corrective_warning` if completion rate < 98%
- **Skips**: New drivers with 0 shifts

#### 3. Weekly Health Evaluation

- **Endpoint**: `GET /api/cron/health-weekly`
- **Does**: Evaluates previous Mon–Sun week, advances/resets stars
- **Sends**: `streak_advanced`, `streak_reset`, or `bonus_eligible` notifications
- **Skips**: Neutral weeks (no assignments)

#### 4. Lock Preferences & Generate Schedule

- **Endpoint**: `GET /api/cron/lock-preferences`
- **Does**: Locks driver preferences, generates assignments for week N+2
- **Sends**: `schedule_locked` to drivers whose preferences were locked, `assignment_confirmed` to assigned drivers

#### 5. Shift Reminders

- **Endpoint**: `GET /api/cron/shift-reminders`
- **Does**: Reminds drivers of today's shift (morning push notification)
- **Sends**: `shift_reminder` (deduplicated per assignment per day)

#### 6. Confirmation Reminders

- **Endpoint**: `GET /api/cron/send-confirmation-reminders`
- **Does**: Reminds drivers 3 days before unconfirmed shift
- **Sends**: `confirmation_reminder` (deduplicated)

#### 7. No-Show Detection

- **Endpoint**: `GET /api/cron/no-show-detection`
- **Does**: Finds confirmed drivers who haven't arrived by route start time
- **Creates**: Emergency bid window (mode=emergency, trigger=no_show, 20% bonus)
- **Sends**: `driver_no_show` alert to route manager
- **Health impact**: Full reset (score=0, stars=0, pool removal)

#### 8. Close Bid Windows

- **Endpoint**: `GET /api/cron/close-bid-windows`
- **Does**: Resolves expired competitive bids (picks winner), transitions or closes others
- **Sends**: `bid_won`/`bid_lost` to participants

#### 9. Auto-Drop Unconfirmed Shifts

- **Endpoint**: `GET /api/cron/auto-drop-unconfirmed`
- **Does**: Drops assignments past 48h confirmation deadline
- **Creates**: Bid window (trigger=auto_drop)
- **Sends**: `shift_auto_dropped` to driver

#### 10. Stale Shift Reminders

- **Endpoint**: `GET /api/cron/stale-shift-reminder`
- **Does**: Reminds drivers who arrived 12+ hours ago but haven't completed shift
- **Sends**: `stale_shift_reminder` (deduplicated per 12h window)

---

## Shift Lifecycle

```
ASSIGN → CONFIRM → ARRIVE → START → COMPLETE → EDIT WINDOW
         7d-48h    today    today    today       1 hour
```

| Stage    | Endpoint                             | Status Change       | Key Validation                          |
| -------- | ------------------------------------ | ------------------- | --------------------------------------- |
| Assign   | Scheduling/manager/bid               | → `scheduled`       | Driver not flagged, under cap           |
| Confirm  | `POST /api/assignments/[id]/confirm` | (stays `scheduled`) | Within 7d-48h window                    |
| Arrive   | `POST /api/shifts/arrive`            | → `active`          | Today, confirmed, before start time     |
| Start    | `POST /api/shifts/start`             | (stays `active`)    | Arrived, parcelsStart not set           |
| Complete | `POST /api/shifts/complete`          | → `completed`       | Started, parcelsReturned ≤ parcelsStart |
| Edit     | `PATCH /api/shifts/[id]/edit`        | (stays `completed`) | Within 1h of completedAt                |

---

## Cancellation & Drop Events

| Event                                | Cancel Type     | Health Impact | Creates Bid Window?        |
| ------------------------------------ | --------------- | ------------- | -------------------------- |
| Driver early cancel (>48h)           | `driver`        | -8 points     | Yes (competitive)          |
| Driver late cancel (≤48h, confirmed) | `late`          | -32 points    | Yes (instant)              |
| Auto-drop (unconfirmed at deadline)  | `auto_drop`     | -12 points    | Yes (auto-determined)      |
| No-show (confirmed, didn't arrive)   | N/A (emergency) | Full reset    | Yes (emergency, 20% bonus) |

**Late cancellation definition**: Assignment was `confirmed` AND cancelled within 48 hours of shift start.

**Late start = no-show**: The no-show cron checks for confirmed assignments where driver hasn't arrived by route start time. The system does not distinguish between "didn't show up" and "showed up but didn't mark arrival" — both are treated as no-shows.

---

## Bid Scoring (Competitive Mode)

```
score = (health × 0.45) + (familiarity × 0.25) + (seniority × 0.15) + (preference × 0.15)
```

| Component         | Normalization                   | Weight |
| ----------------- | ------------------------------- | ------ |
| Health            | `min(score / 96, 1)`            | 45%    |
| Route familiarity | `min(completions / 20, 1)`      | 25%    |
| Seniority         | `min(tenureMonths / 12, 1)`     | 15%    |
| Route preference  | 1 if in top-3 preferred, else 0 | 15%    |

Tiebreaker: earliest bid wins.

---

## Bidding Modes

| Mode        | When                         | Behavior                           | Closes At          |
| ----------- | ---------------------------- | ---------------------------------- | ------------------ |
| Competitive | >24h before shift            | Multi-bid, scored, winner selected | 24h before shift   |
| Instant     | ≤24h before shift            | First-come-first-served            | Shift start time   |
| Emergency   | No-show or manager-triggered | Instant-assign + pay bonus         | Shift start or EOD |

---

## Notification Types

### System-Triggered (20 implemented)

| Type                        | Trigger                               | Recipient        |
| --------------------------- | ------------------------------------- | ---------------- |
| `shift_reminder`            | Morning cron (day of shift)           | Driver           |
| `confirmation_reminder`     | 3 days before unconfirmed shift       | Driver           |
| `assignment_confirmed`      | Schedule generation                   | Driver           |
| `schedule_locked`           | Preferences locked by lock cron       | Driver           |
| `shift_auto_dropped`        | Auto-drop cron                        | Driver           |
| `bid_open`                  | Bid window created                    | Eligible drivers |
| `bid_won`                   | Bid resolved (winner)                 | Driver           |
| `bid_lost`                  | Bid resolved (losers)                 | Drivers          |
| `shift_cancelled`           | Assignment cancelled                  | Driver           |
| `emergency_route_available` | Emergency bid window                  | Eligible drivers |
| `warning`                   | Driver flagged                        | Driver           |
| `corrective_warning`        | Completion rate < threshold           | Driver           |
| `streak_advanced`           | Earned new star                       | Driver           |
| `streak_reset`              | Hard-stop reset stars                 | Driver           |
| `bonus_eligible`            | Reached 4 stars                       | Driver           |
| `stale_shift_reminder`      | Shift arrived but not completed 12h+  | Driver           |
| `route_unfilled`            | Bid window failed to find replacement | Manager          |
| `route_cancelled`           | Driver cancelled assignment           | Manager          |
| `driver_no_show`            | No-show detected                      | Manager          |
| `return_exception`          | Driver filed return exceptions        | Manager          |

### Reserved (1 — not yet triggered)

| Type     | Status                                                      |
| -------- | ----------------------------------------------------------- |
| `manual` | Reserved for future manager messaging feature (enum exists) |

---

## Configuration Reference

All values in `src/lib/config/dispatchPolicy.ts`:

```typescript
health.points.confirmedOnTime:     1
health.points.arrivedOnTime:       2
health.points.completedShift:      2
health.points.highDelivery:        1
health.points.bidPickup:           2
health.points.urgentPickup:        4
health.points.autoDrop:           -12
health.points.earlyCancel:        -8
health.points.lateCancel:         -32

health.tierThreshold:              96    // Tier II entry
health.lateCancelRollingDays:      30    // Hard-stop window
health.lateCancelThreshold:        2     // Late cancels for hard-stop
health.correctiveCompletionThreshold: 0.98 // Warning sent below this
health.correctiveRecoveryDays:     7     // Cooldown between warnings
health.maxStars:                   4
health.simulationBonus.fourStarBonusPercent: 10

health.qualifyingWeek.minAttendanceRate:      1.0   // 100%
health.qualifyingWeek.minCompletionRate:      0.95  // 95%
health.qualifyingWeek.maxNoShows:             0
health.qualifyingWeek.maxLateCancellations:   0

confirmation.windowDaysBeforeShift:    7
confirmation.deadlineHoursBeforeShift: 48
confirmation.reminderLeadDays:         3

bidding.instantModeCutoffHours:    24
bidding.emergencyBonusPercent:     20
bidding.scoreWeights.health:       0.45
bidding.scoreWeights.routeFamiliarity: 0.25
bidding.scoreWeights.seniority:    0.15
bidding.scoreWeights.routePreferenceBonus: 0.15

flagging.attendanceThresholds.earlyShiftCount:         10
flagging.attendanceThresholds.beforeEarlyShiftCount:    0.8
flagging.attendanceThresholds.atOrAfterEarlyShiftCount: 0.7
flagging.gracePeriodDays:          7
flagging.reward.minShifts:         20
flagging.reward.minAttendanceRate: 0.95
flagging.weeklyCap.base:           4
flagging.weeklyCap.reward:         6
flagging.weeklyCap.min:            1
```

---

## Database Tables

| Table                   | Purpose                     | Key Columns                                                                                     |
| ----------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| `driverMetrics`         | Attendance/completion stats | `totalShifts`, `completedShifts`, `attendanceRate`, `completionRate`                            |
| `driverHealthState`     | Current health state        | `currentScore`, `stars`, `streakWeeks`, `assignmentPoolEligible`, `requiresManagerIntervention` |
| `driverHealthSnapshots` | Daily score history         | `evaluatedAt`, `score`, `hardStopTriggered`, `contributions`                                    |
| `assignments`           | Driver-route pairings       | `status`, `confirmedAt`, `cancelType`, `date`                                                   |
| `shifts`                | Actual work records         | `arrivedAt`, `parcelsStart`, `completedAt`, `editableUntil`                                     |
| `bidWindows`            | Open/resolved bid windows   | `mode`, `trigger`, `status`, `closesAt`                                                         |
| `bids`                  | Individual driver bids      | `score`, `status`, `bidAt`                                                                      |

---

## Key Source Files

| File                                       | Contains                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| `src/lib/server/services/health.ts`        | Score computation, star evaluation, daily/weekly crons |
| `src/lib/server/services/metrics.ts`       | Attendance/completion recalculation                    |
| `src/lib/server/services/flagging.ts`      | Flag check, grace period, cap reduction                |
| `src/lib/server/services/bidding.ts`       | Bid windows, scoring, resolution, instant assign       |
| `src/lib/server/services/confirmations.ts` | Confirmation window, deadline calculation              |
| `src/lib/server/services/noshow.ts`        | No-show detection, emergency bid creation              |
| `src/lib/server/services/scheduling.ts`    | Weekly schedule generation algorithm                   |
| `src/lib/server/services/notifications.ts` | Send/bulk send, emergency driver notification          |
| `src/lib/config/dispatchPolicy.ts`         | All configurable thresholds and weights                |
