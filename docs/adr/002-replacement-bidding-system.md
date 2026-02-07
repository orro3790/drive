# ADR 002: Replacement Bidding System

## Status

Accepted

## Date

2026-02-02

## Context

When a shift becomes unfilled (driver cancels, no-show, no eligible driver), we need to fill it quickly. The original spec proposed "first-come-first-served" (FCFS) assignment.

Requirements:

- Fill shifts as fast as possible
- Prioritize reliable, experienced drivers
- Use driver preferences to improve matching
- Provide transparency for dispute resolution

## Decision

Replace FCFS with a **three-mode bidding system** (competitive, instant, emergency):

1. **Shift opens** → Push notification to all eligible drivers
2. **Bidding window opens** in the appropriate mode
3. **Drivers bid** (express interest, not instant assignment — except in instant/emergency modes)
4. **Window closes** → Algorithm selects winner (competitive) or first-come wins (instant/emergency)
5. **Winner notified**, losers notified, assignment updated

### Bidding Modes

**Competitive** (> 24h before shift):

- Window closes 24h before shift start
- Multiple drivers can bid; highest score wins
- If no bids received: transitions to instant mode

**Instant** (≤ 24h before shift):

- Window closes at shift start time
- First driver to accept wins immediately
- No scoring, no waiting

**Emergency** (manager-triggered or 9 AM no-show auto-detection):

- Always instant-assign (first to accept wins)
- Optional pay bonus (default 20%, stored as `payBonusPercent`)
- Closes at shift start or end of day

### Scoring Algorithm

```
score = (completion_rate * 0.4) +
        (route_familiarity_normalized * 0.3) +
        (attendance_rate * 0.2) +
        (route_preference_bonus * 0.1)
```

Priority weights:

1. **Completion rate (40%)**: Can they deliver? Most important.
2. **Route familiarity (30%)**: Do they know this route? Faster completion.
3. **Attendance rate (20%)**: Reliability signal, but lower weight because bidding itself signals intent.
4. **Route preference (10%)**: Bonus if this route is in driver's top 3.

### Manager Override

Managers can always manually assign any driver, bypassing the algorithm.

## Rationale

### Why not FCFS?

- FCFS rewards fastest phone-checker, not best driver
- Doesn't leverage driver preference data
- No way to prioritize experienced drivers for difficult routes
- Creates "race condition" UX (stressful for drivers)

### Why three modes?

- **Competitive** gives time to collect bids and pick the best driver when there's runway
- **Instant** fills shifts fast when time is short — no point waiting for bids that won't come
- **Emergency** handles day-of crises (no-shows at 9 AM) with urgency + pay incentive
- Fairer to drivers who may be busy when notification arrives (competitive window)
- Provides transparency (manager can see all bids + scores in competitive mode)

### Why these weights?

- Completion rate is #1 because the job is delivering parcels
- Route familiarity is #2 because knowing the route means faster, better service
- Attendance is #3 because while important, the act of bidding already signals availability
- Preference bonus rewards drivers who care about specific routes

## Consequences

### Positive

- Better driver-route matching
- Transparent scoring for dispute resolution
- Fairer to all eligible drivers
- Can tune weights based on operational feedback

### Negative

- More complex implementation than FCFS
- Requires scheduled job to close bid windows
- Drivers wait longer to know if they got the shift
- Edge case handling for last-minute shifts

### Implementation Notes

- `BidWindow` table tracks open/closed state with `mode` (competitive/instant/emergency), `trigger`, and `payBonusPercent` columns
- `assignmentId` is NOT unique on `bidWindows` — an assignment can have multiple bid windows (e.g., competitive → instant fallback, or re-opened emergency)
- Vercel Cron job runs every minute to close expired windows
- Score calculated at resolution time (not bid time) for fairness
- Audit log captures algorithm decision for transparency
