# Technical Specification: Driver Operations Platform

## Overview

An event-driven operations automation platform for delivery logistics that automatically schedules drivers to routes, detects availability failures, and fills gaps in real-time through a bidding system.

**Scale**: 10,000 parcels/day initially (80-100 drivers), scaling to 50,000+ parcels/day.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | SvelteKit + TypeScript | Developer expertise, agent-friendly typed code |
| **Mobile wrapper** | Capacitor | Installable app, native features if needed later |
| **Database** | PostgreSQL (Neon) | Relational fits domain, serverless, no vendor lock-in |
| **ORM** | Drizzle | Type-safe, excellent DX with TypeScript |
| **Auth** | Better Auth | Session-based, works well with SvelteKit |
| **Hosting** | Vercel | SvelteKit adapter, free cron, good DX |
| **Notifications** | Firebase Cloud Messaging | Free, native push via Capacitor |
| **Scheduled jobs** | Vercel Cron | Free tier sufficient for scale |
| **Real-time (dashboard)** | Server-Sent Events (SSE) | Simple, one-way, works in SvelteKit |
| **Search** | Lightweight fuzzy matching (TS) | No Typesense/Algolia needed |
| **Observability** | Pino + Axiom | Structured logging, dev pretty-print, prod log shipping |
| **Time zone** | Toronto/Eastern (single) | Server time = local time |

---

## Architecture

### Monolith (SvelteKit)

Single SvelteKit application handling:
- Driver mobile app (Capacitor-wrapped)
- Manager web dashboard
- API routes for all operations
- SSE endpoints for real-time updates

### Scheduled Jobs (Vercel Cron)

| Job | Frequency | Description |
|-----|-----------|-------------|
| Lock preferences | Weekly (Sun 23:59) | Freeze driver preferences, generate next week's schedule |
| Close bidding windows | Every minute | Check for expired bid windows, run selection algorithm |
| Performance check | Daily | Calculate metrics, flag underperformers |
| Send reminders | Daily | Upcoming shift reminders |

---

## Data Model

### Entities

```
User
├── id: uuid
├── email: string (unique)
├── password_hash: string
├── first_name: string
├── last_name: string
├── phone: string
├── role: enum('driver', 'manager')
├── weekly_cap: int (default: 4, max: 6)
├── is_flagged: boolean
├── flag_warning_date: timestamp | null
├── created_at: timestamp
└── updated_at: timestamp

Warehouse
├── id: uuid
├── name: string
├── address: string
├── created_by: uuid (User)
├── created_at: timestamp
└── updated_at: timestamp

Route (one-to-one with warehouse)
├── id: uuid
├── name: string (e.g., "Guelph1", "Hamilton B")
├── warehouse_id: uuid (Warehouse)
├── created_by: uuid (User)
├── created_at: timestamp
└── updated_at: timestamp

DriverPreferences
├── id: uuid
├── user_id: uuid (User)
├── preferred_days: int[] (0-6, Sunday=0)
├── preferred_routes: uuid[] (top 3 Route IDs)
├── updated_at: timestamp
└── locked_at: timestamp | null

Assignment
├── id: uuid
├── route_id: uuid (Route)
├── user_id: uuid (User) | null
├── warehouse_id: uuid (Warehouse)
├── date: date
├── status: enum('scheduled', 'active', 'completed', 'cancelled', 'unfilled')
├── assigned_by: enum('algorithm', 'manager', 'bid')
├── assigned_at: timestamp
├── created_at: timestamp
└── updated_at: timestamp

Shift (when assignment becomes active)
├── id: uuid
├── assignment_id: uuid (Assignment)
├── parcels_start: int | null
├── parcels_delivered: int | null
├── parcels_returned: int | null
├── started_at: timestamp | null
├── completed_at: timestamp | null
├── cancelled_at: timestamp | null
├── cancel_reason: enum | null
├── cancel_notes: text | null
└── created_at: timestamp

Bid
├── id: uuid
├── assignment_id: uuid (Assignment)
├── user_id: uuid (User)
├── score: float (calculated)
├── status: enum('pending', 'won', 'lost')
├── bid_at: timestamp
├── window_closes_at: timestamp
└── resolved_at: timestamp | null

BidWindow
├── id: uuid
├── assignment_id: uuid (Assignment)
├── opens_at: timestamp
├── closes_at: timestamp
├── status: enum('open', 'closed', 'resolved')
└── winner_id: uuid (User) | null

DriverMetrics (denormalized for performance)
├── user_id: uuid (User)
├── total_shifts: int
├── completed_shifts: int
├── attendance_rate: float
├── completion_rate: float
├── updated_at: timestamp

RouteCompletion (for familiarity tracking)
├── user_id: uuid (User)
├── route_id: uuid (Route)
├── completion_count: int
└── last_completed_at: timestamp

Notification
├── id: uuid
├── user_id: uuid (User)
├── type: enum('shift_reminder', 'bid_open', 'bid_won', 'bid_lost', 'shift_cancelled', 'warning', 'manual')
├── title: string
├── body: string
├── data: jsonb
├── read: boolean
├── created_at: timestamp

AuditLog
├── id: uuid
├── entity_type: string
├── entity_id: uuid
├── action: string
├── actor_id: uuid (User) | null
├── actor_type: enum('user', 'system')
├── changes: jsonb
├── created_at: timestamp
```

---

## Scheduling Logic

### Weekly Schedule Generation (Sunday 23:59 Toronto time)

1. Lock all driver preferences
2. For each day in the upcoming week:
   - For each route:
     - Find drivers who: prefer this day + prefer this route + under weekly cap + not flagged
     - Sort by: route familiarity → completion rate → attendance rate
     - Assign top driver
     - If no eligible driver: mark as unfilled
3. Generate schedule confirmation notifications

### New Driver Handling

- Can bid on spontaneous shifts immediately after signup
- Automatic scheduling begins the week after next (due to 2-week lookahead)
- Info banner explains waiting period

---

## Replacement/Bidding System

### Trigger
- Assignment becomes unfilled (cancellation, no-show, no eligible driver)

### Flow
1. Create BidWindow with `closes_at`:
   - If shift > 30 min away: `closes_at = now + 30 min`
   - If shift < 30 min away: `closes_at = shift_start_time`
2. Push notification to ALL drivers (filtered by: under weekly cap)
3. Drivers bid (express interest)
4. On window close:
   - Calculate scores for all bids
   - Assign to highest score
   - Notify winner + losers
5. If no bids: window stays open indefinitely until first bid

### Scoring Algorithm

```
score = (completion_rate * 0.4) +
        (route_familiarity_normalized * 0.3) +
        (attendance_rate * 0.2) +
        (route_preference_bonus * 0.1)

where:
- completion_rate: parcels_delivered / parcels_start (0-1)
- route_familiarity_normalized: min(completions_for_route / 20, 1)
- attendance_rate: completed_shifts / total_shifts (0-1)
- route_preference_bonus: 1.0 if route in driver's top 3, else 0
```

Manager can see this breakdown for transparency/dispute resolution.

---

## Performance & Flagging

### Metrics Tracked
- Attendance rate: completed_shifts / total_shifts
- Completion rate: parcels_delivered / parcels_start (averaged)
- Route familiarity: completion_count per route

### Flag Thresholds
- Before 10 shifts: flag if attendance < 80%
- After 10 shifts: flag if attendance < 70%

### Flag Consequences
- Warning issued (flag_warning_date set)
- 1 week grace period to improve
- If still below threshold after 1 week: lose 1 day from weekly cap
- Flagged drivers excluded from auto-scheduling and bidding
- Manager can manually unflag/reinstate

### Reward Threshold
- After 20 confirmed shifts with attendance >= 95%: weekly cap increases to 6

---

## User Flows

### Driver: Daily Flow

```
Open app
  ├── No active shift
  │   └── See dashboard: this week schedule, next week schedule, countdown, metrics
  │
  └── Active shift today
      ├── [Start Shift] → Input parcel count
      ├── [Report Issue] → Select reason + notes → Manager notified
      └── [Complete Shift] → Input delivered + remaining → Confirmation modal
```

### Driver: Preference Management

```
Settings → Preferences
  ├── Select work days (checkboxes, Mon-Sun)
  ├── Select top 3 routes (data table with search)
  └── See countdown to lock deadline
```

### Driver: Bid on Open Shift

```
Push notification: "Hamilton B open for Thursday"
  └── Open app → See bid in "Pending Bids"
      ├── Already bid: See countdown, ranking status
      └── Not bid yet: [Bid Now] button (if under weekly cap)

Window closes → Push notification: "You won Hamilton B" or "Hamilton B assigned to another driver"
```

### Manager: Monitor Coverage

```
Dashboard → Routes table
  ├── Filter by: warehouse, status (assigned/bidding/unfilled)
  ├── Click row → Side panel:
  │   ├── Driver info + metrics
  │   ├── Audit history
  │   └── If bidding: ranked bidder list with scores
  └── Actions:
      ├── [Assign Driver] → Manual override
      ├── [Push Notification] → Manual notification
      └── [Edit Route] → Update route details
```

### Manager: Handle Cancellation Alert

```
Push notification: "John D. cancelled Hamilton B shift"
  └── Open app → Inbox → See cancellation details
      ├── Reason enum + notes
      ├── [Contact Driver] → Phone number
      ├── [Open for Bidding] → System handles replacement
      └── [Assign Manually] → Pick specific driver
```

---

## Driver App Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard (current schedule, active shift, metrics, pending bids) |
| `/settings` | Account info + preferences |
| `/notifications` | Inbox with notification history |
| `/schedule` | Full schedule view with CRUD (mark unavailable) |

## Manager Dashboard Pages

| Route | Description |
|-------|-------------|
| `/` | Routes overview table with filters |
| `/warehouses` | Warehouse CRUD |
| `/drivers` | Driver list with metrics, flag management |
| `/notifications` | Alert inbox |
| `/settings` | Account settings |

---

## UI Components

### Available Components
- `app-shell/` - AppSidebar, PageHeader, SidebarItem
- `primitives/` - Button, Modal, Checkbox, Chip, Toggle, Drawer, etc.
- `data-table/` - TanStack-based table with filtering, pagination, export
- `icons/` - Icon components
- Combobox, Select, DatePicker, ConfirmationDialog, ToastContainer

### Design System
- `app.css` - Design tokens and CSS variables
- Paraglide i18n - English (default), Chinese (future)

---

## Notifications

### Push (via Firebase Cloud Messaging)
Critical, time-sensitive notifications sent via push:
- Bid opportunities (shift opened)
- Bid results (won/lost)
- Shift reminders (morning of)
- Cancellation alerts (managers)
- Warning notifications

Delivered through Capacitor native push plugin. Free unlimited usage.

### In-App
- Persisted in Notification table
- Inbox UI with read/unread status
- Actionable items surfaced
- Non-urgent notifications (schedule confirmations, metrics updates)

---

## Offline Strategy

| Operation | Behavior |
|-----------|----------|
| View schedule | Cached locally |
| View metrics | Cached locally |
| Bid on shift | Requires connectivity |
| Start/complete shift | Requires connectivity |
| Submit cancellation | Requires connectivity |

Clear "No connection" UI state for write operations.

---

## Security Considerations

- Server-side validation for weekly cap on bids
- Role-based access (driver vs manager routes)
- Audit logging for all assignment changes
- Phone numbers stored but not exposed to other drivers
- Manager actions logged with actor_id

---

## Out of Scope (Explicit)

- GPS/location tracking
- Route navigation/directions
- Parcel-level tracking (scans, delivery confirmation)
- Payroll integration
- Chat/messaging between users
- Multi-timezone support
- App Store distribution (internal only via TestFlight/APK)
