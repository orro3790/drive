# Drive - Canonical Specification

> **Single source of truth** for the Drive operations platform.
> All implementation should reference this document.
> ADRs in `docs/adr/` contain decision rationale.

---

## Overview

**Drive** is an event-driven operations automation platform for delivery logistics that:

- Automatically schedules drivers to fixed routes
- Detects availability failures and no-shows
- Fills gaps through a bidding system (not FCFS)
- Tracks performance with reliability-based flagging
- Provides mobile-first driver app + manager dashboard

**Scale**: 10,000 parcels/day initially (80-100 drivers), scaling to 50,000+.

**What it is NOT**: A marketplace, HR system, routing/navigation engine, payroll system, or chat platform.

---

## Tech Stack

| Layer              | Technology                      |
| ------------------ | ------------------------------- |
| Frontend           | SvelteKit + TypeScript          |
| Mobile             | Capacitor (native push via FCM) |
| Database           | PostgreSQL (Neon) + Drizzle ORM |
| Auth               | Better Auth (session-based)     |
| Hosting            | Vercel                          |
| Push Notifications | Firebase Cloud Messaging        |
| Scheduled Jobs     | Vercel Cron                     |
| Real-time          | Server-Sent Events (SSE)        |
| Observability      | Pino + Axiom                    |
| i18n               | Paraglide (en, zh)              |

---

## Core Concepts

### Entities

| Entity              | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| **User**            | Driver or manager. Has role, weekly cap, flag status.                          |
| **Warehouse**       | Physical location where routes originate.                                      |
| **Route**           | Fixed delivery route tied to a warehouse. Routes persist over time.            |
| **Assignment**      | A route assigned to a driver for a specific date.                              |
| **Shift**           | Active work record when assignment becomes active (parcel counts, timestamps). |
| **Bid**             | Driver's expression of interest in an open assignment.                         |
| **BidWindow**       | Time-limited period during which drivers can bid on an unfilled assignment.    |
| **DriverMetrics**   | Denormalized performance data (attendance rate, completion rate).              |
| **RouteCompletion** | Tracks driver familiarity with specific routes.                                |
| **Notification**    | In-app notification record.                                                    |
| **AuditLog**        | Change history for compliance and debugging.                                   |

### Time Zone

All operations run in **Toronto/Eastern time**. Server time = local time. No multi-timezone support.

---

## Scheduling System

### Two-Week Lookahead Model

The system maintains three schedule windows:

| Week     | State     | Description                            |
| -------- | --------- | -------------------------------------- |
| Week N   | Executing | Current week, shifts happening         |
| Week N+1 | Locked    | Preferences frozen, schedule generated |
| Week N+2 | Open      | Drivers can edit preferences           |

### Preference Lock Cycle

**Lock deadline**: Sunday 23:59:59 Toronto time

When lock occurs:

1. All driver preferences for Week N+2 are frozen
2. Schedule generation runs for Week N+2
3. Drivers notified of their assignments

### Schedule Generation Algorithm

For each day in the target week, for each route:

1. Find eligible drivers (prefer this day + prefer this route + under weekly cap + not flagged)
2. Sort by: route familiarity → completion rate → attendance rate
3. Assign top driver
4. If no eligible driver: mark assignment as `unfilled`

### New Driver Handling

- Can bid on spontaneous openings **immediately** after signup
- Scheduled shifts begin **Week N+2** (up to ~2 weeks wait)
- Info banner in app explains waiting period

---

## Bidding System

> **Note**: This is NOT first-come-first-served. ADR 002 explicitly rejected FCFS in favor of algorithm-based selection.

### Trigger

A bid window opens when an assignment becomes unfilled due to:

- Driver cancellation
- No-show (failed to confirm)
- No eligible driver at schedule generation

### Bid Window Modes

| Mode            | Trigger                             | Duration                  | Resolution              |
| --------------- | ----------------------------------- | ------------------------- | ----------------------- |
| **Competitive** | > 24h before shift                  | Closes 24h before shift   | Highest score wins      |
| **Instant**     | ≤ 24h before shift, or no comp bids | Closes at shift start     | First to accept wins    |
| **Emergency**   | Manager-triggered or 9 AM no-show   | Closes at shift start/EOD | First to accept + bonus |

- Competitive windows with no bids automatically transition to instant mode
- Emergency mode includes an optional pay bonus (default 20%)

### Notification

When a bid window opens:

- Push notification sent to **all drivers** who are:
  - Under their weekly cap
  - Not flagged
- No geographic or preference filtering — drivers self-select, algorithm handles scoring

### Scoring Algorithm

When the bid window closes (or first bid arrives for indefinite windows):

```
score = (completion_rate × 0.4) +
        (route_familiarity_normalized × 0.3) +
        (attendance_rate × 0.2) +
        (route_preference_bonus × 0.1)

where:
  completion_rate = parcels_delivered / parcels_start (0-1)
  route_familiarity_normalized = min(completions_for_route / 20, 1)
  attendance_rate = completed_shifts / total_shifts (0-1)
  route_preference_bonus = 1.0 if route in driver's top 3, else 0
```

Highest score wins. Ties broken by earliest bid timestamp.

### Resolution

1. Winner assigned to the route
2. Winner notified: "You won [Route Name] for [Date]"
3. Losers notified: "[Route Name] assigned to another driver"
4. Manager can see score breakdown for transparency

### Manager Override

Managers can **always** manually assign any driver, bypassing the bidding system entirely.

---

## Availability & Confirmation

### Confirmation Model

**Mandatory confirmation required.** Drivers must explicitly confirm each upcoming shift within a defined window.

- **Confirmation window**: 7 days to 48 hours before shift
- **72h before**: Reminder notification sent to unconfirmed drivers
- **48h before**: Unconfirmed shifts auto-dropped and reopened for bidding
- **Deployment date**: 2026-03-01 (pre-existing assignments skip confirmation)

### Arrival Deadline

Drivers must signal arrival (tap "Arrive" in the app) by **9:00 AM Toronto time** on the day of their shift. Failure to arrive by 9 AM triggers a no-show and opens an emergency bid window.

### Post-Shift Edit Window

After completing a shift, drivers have a **1-hour window** to edit parcel counts (parcelsReturned). The `editableUntil` timestamp is set server-side at completion time.

### Cancellation Rules

| Timing                  | Allowed | Impact                         |
| ----------------------- | ------- | ------------------------------ |
| > 48 hours before shift | Yes     | No penalty                     |
| ≤ 48 hours before shift | Yes     | Counts against attendance rate |
| After shift start       | N/A     | Treated as no-show             |

### No-Show Definition

A **no-show** occurs when a driver:

- Did not arrive by 9:00 AM Toronto time on shift day, AND
- Did not cancel before the arrival deadline

No-shows count against attendance rate and may trigger flagging. The route is automatically reopened as an emergency bid window.

---

## Performance & Flagging

### Metrics Tracked

| Metric            | Calculation                              |
| ----------------- | ---------------------------------------- |
| Attendance Rate   | completed_shifts / total_assigned_shifts |
| Completion Rate   | avg(parcels_delivered / parcels_start)   |
| Route Familiarity | completion_count per route               |

### Flag Thresholds

| Experience Level | Flag If Attendance Below |
| ---------------- | ------------------------ |
| Before 10 shifts | 80%                      |
| After 10 shifts  | 70%                      |

### Flag Consequences

1. Warning issued (`flag_warning_date` set)
2. **1 week grace period** to improve
3. During grace period: driver can still work scheduled shifts
4. After grace period, if still below threshold: **lose 1 day from weekly cap**
5. Flagged drivers are **excluded from**:
   - Automatic scheduling
   - Bidding on replacements
6. Manager can manually unflag/reinstate at any time

### Reward Threshold

After **20 confirmed shifts** with attendance **≥ 95%**: weekly cap increases from 4 to 6.

---

## Weekly Caps

| Status                                       | Weekly Cap       |
| -------------------------------------------- | ---------------- |
| Default                                      | 4 days/week      |
| High performer (20+ shifts, 95%+ attendance) | 6 days/week      |
| Flagged (after grace period)                 | cap reduced by 1 |
| Manager override                             | Any value 1-6    |

---

## User Interfaces

### Driver App (Mobile-First)

| Route            | Description                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `/`              | Dashboard: today's shift, health card (score/stars/streak), this week, next week, pending bids |
| `/schedule`      | Full schedule view, mark unavailable                                                            |
| `/settings`      | Account info, preferences (work days, top 3 routes)                                             |
| `/notifications` | Inbox with notification history                                                                 |

### Manager Dashboard (Web)

| Route            | Description                                                  |
| ---------------- | ------------------------------------------------------------ |
| `/`              | Routes overview table with filters (warehouse, status, date) |
| `/drivers`       | Driver list with metrics, flag management, cap adjustment    |
| `/warehouses`    | Warehouse CRUD                                               |
| `/notifications` | Alert inbox                                                  |
| `/settings`      | Account settings                                             |

### Manager Capabilities

Managers can:

- View all routes, assignments, and coverage status
- Manually assign any driver to any route (override bidding)
- Unflag/reinstate flagged drivers
- Adjust driver weekly caps
- Send manual push notifications
- View bid score breakdowns
- Edit routes and warehouses

---

## Notifications

### Push Notifications (Firebase Cloud Messaging)

Time-sensitive, critical notifications:

| Type              | Trigger                  | Recipients       |
| ----------------- | ------------------------ | ---------------- |
| `bid_open`        | Bid window opens         | Eligible drivers |
| `bid_won`         | Driver wins bid          | Winner           |
| `bid_lost`        | Bid window closes        | Losers           |
| `shift_reminder`  | Morning of shift         | Assigned driver  |
| `shift_cancelled` | Assignment cancelled     | Affected driver  |
| `driver_no_show`  | No-show detected         | Manager          |
| `warning`         | Driver flagged           | Flagged driver   |
| `urgent_unfilled` | No bids after escalation | Manager          |

### In-App Notifications

Persisted in database, shown in inbox:

- Schedule confirmations
- Metrics updates
- Non-urgent system messages

---

## Scheduled Jobs (GitHub Actions Cron)

| Job               | Schedule             | Description                                            |
| ----------------- | -------------------- | ------------------------------------------------------ |
| Lock preferences  | Sunday 23:59 Toronto | Freeze preferences, generate Week N+2 schedule         |
| Close bid windows | Every 15 minutes     | Check for expired windows, run scoring, assign winners |
| Performance check | Daily (time TBD)     | Recalculate metrics, apply flag logic                  |
| No-show detection | Daily after start    | Detect no-shows, open bid windows, alert managers      |
| Send reminders    | Daily (morning)      | Shift reminders for today's assignments                |

---

## Offline Strategy

| Operation            | Behavior                  |
| -------------------- | ------------------------- |
| View schedule        | Cached locally            |
| View metrics         | Cached locally            |
| Bid on shift         | **Requires connectivity** |
| Start/complete shift | **Requires connectivity** |
| Submit cancellation  | **Requires connectivity** |

### Implementation

- **Caching**: Service worker with stale-while-revalidate strategy
- **No offline write queue**: Actions require connectivity
- **Offline UI**: Banner displayed when `navigator.onLine` is false: "You're offline. Some features unavailable."
- **Reconnection**: Automatic refresh of stale data when connectivity returns

---

## Real-Time Updates (SSE)

Manager dashboard receives real-time updates via Server-Sent Events.

### Endpoint

`GET /api/sse/manager` (manager role only, session-authenticated)

### Events

| Event                | Trigger                       | Payload                                |
| -------------------- | ----------------------------- | -------------------------------------- |
| `assignment:updated` | Assignment status changes     | assignment ID, new status, driver info |
| `bid_window:opened`  | New bid window created        | assignment ID, route, closes_at        |
| `bid_window:closed`  | Bid resolved                  | assignment ID, winner info             |
| `driver:flagged`     | Driver crosses flag threshold | driver ID, reason                      |

### Connection Handling

- **Reconnection**: Browser's native EventSource auto-reconnects on disconnect
- **Heartbeat**: `:keepalive` comment sent every 30 seconds to prevent timeout
- **Scope**: Manager role only — drivers receive push notifications instead

---

## Security

- Server-side validation for weekly cap on bids
- Role-based access (driver vs manager routes)
- Audit logging for all assignment changes
- Phone numbers stored but not exposed to other drivers
- Manager actions logged with actor_id
- Invite code gate for driver signup (optional)

---

## Out of Scope (Explicit)

- GPS/location tracking
- Route navigation/directions
- Parcel-level tracking (scans, delivery confirmation)
- Payroll integration
- Chat/messaging between users
- Multi-timezone support
- App Store distribution (internal only via TestFlight/APK)

---

## Appendix: Data Model Reference

See `docs/specs/data-model.md` for complete Drizzle schema.

## Appendix: Development Patterns

See `docs/agent-guidelines.md` for implementation conventions.

## Appendix: Decision Records

- `docs/adr/001-tech-stack.md` - Technology choices
- `docs/adr/002-replacement-bidding-system.md` - Bidding vs FCFS decision
- `docs/adr/003-scheduling-model.md` - Two-week lookahead rationale
