# Drive

Driver Operations Platform for delivery logistics.

**App Name**: Drive
**Repo**: `orro3790/drive`

## Strategic Context

### What Drive Really Is

Drive is **not scheduling software**. It is an **operations automation platform that replaces human broker labor** in last-mile delivery.

In the Canadian last-mile delivery industry, the typical structure is:

> **Delivery company → Brokers → Drivers**

Brokers (dispatchers/managers) are paid ~$2.00/parcel. They pay drivers $1.30-$1.50/parcel and keep $0.50-$0.70 for their coordination work: scheduling, no-show replacement, daily dispatch, and performance management. This is largely manual — phone calls, group chats, spreadsheets.

**Drive automates 60-70% of what brokers do**, enabling fewer managers to handle more drivers. A company currently employing 10 brokers to manage 200 drivers can reduce to 4 managers handling 50 drivers each with Drive handling scheduling, confirmations, vacancy filling, and performance tracking.

### Revenue Model

**Per-parcel usage-based pricing** — not SaaS subscriptions.

|                                  | Per parcel                      |
| -------------------------------- | ------------------------------- |
| Company pays broker (current)    | $2.00                           |
| Company pays driver (with Drive) | $1.30-$1.50                     |
| Company pays Drive               | ~$0.30 (split among 3 partners) |
| **Company saves**                | **$0.20-$0.40/parcel**          |

At 50,000 parcels/day, this means ~$330K/month in Drive revenue and $220-440K/month in savings for the customer. **Drive pays for itself on day one** — the customer pays less than before while getting better operational reliability.

There is a prospective first customer delivering 50,000 parcels/day willing to pilot.

### Competitive Positioning

**Drive's competitor is the broker, not other software.** Generic scheduling tools (Deputy, Workforce.com) sell $5-9/user/month subscriptions. Route optimization platforms (Bringg, Onfleet) focus on delivery routing. Neither targets the broker-replacement arbitrage.

Drive's unique combination that no single competitor offers:

1. **Mandatory confirmation workflow** with auto-drop → auto-reopen
2. **3-mode bidding cascade** (competitive → instant → emergency) that auto-transitions based on time-to-shift
3. **Health scoring with gamified stars/streaks** for driver retention
4. **Full shift lifecycle** as one coherent flow: schedule → confirm → arrive → start → complete → edit window

The per-parcel pricing model is itself a differentiator — revenue scales with customer volume, making it an easy yes for the customer ("you only pay when parcels move").

### What It Is NOT

- A marketplace or job board (not competing with hiring platforms)
- A routing/navigation engine (Drive manages the workforce, not the route)
- An HR or payroll system
- Generic employee scheduling software

## Project Status: Ready for Implementation

Tech stack interview **completed**. Specifications documented in `documentation/specs/`. Ready to begin implementation.

## Quick Reference

| Layer         | Technology                  |
| ------------- | --------------------------- |
| Frontend      | SvelteKit + TypeScript      |
| Mobile        | Capacitor (native push)     |
| Database      | PostgreSQL (Neon) + Drizzle |
| Auth          | Better Auth                 |
| Hosting       | Vercel                      |
| Push          | Firebase Cloud Messaging    |
| Cron          | Vercel Cron                 |
| Real-time     | SSE                         |
| Observability | Pino + Axiom                |

## Domain Context

**What we're building**: Event-driven operations automation platform that replaces manual broker coordination in last-mile delivery logistics.

**Core capabilities**:

- Automatic driver-to-route scheduling (2-week lookahead, Sunday lock)
- Bidding-based vacancy filling with 3-mode cascade (competitive/instant/emergency)
- Mandatory shift confirmation with auto-drop and auto-reopen
- Driver health scoring with gamified star/streak progression for retention
- No-show auto-detection with automatic emergency bid window
- Mobile-first driver app + manager dashboard
- Per-parcel economics: every feature exists to reduce the per-parcel management cost

## Key Documents

| Document               | Location                                                 |
| ---------------------- | -------------------------------------------------------- |
| Technical Spec         | `documentation/specs/SPEC.md`                            |
| Data Model             | `documentation/specs/data-model.md`                      |
| Agent Guidelines       | `documentation/agent-guidelines.md`                      |
| Agent Guidelines Index | `documentation/agent-guidelines/index.md`                |
| Domain Context         | `non-technical-specs.md`, `project-summary-condensed.md` |
| ADR: Tech Stack        | `documentation/adr/001-tech-stack.md`                    |
| ADR: Bidding System    | `documentation/adr/002-replacement-bidding-system.md`    |
| ADR: Scheduling        | `documentation/adr/003-scheduling-model.md`              |

## Server Services

Business logic in `src/lib/server/services/`:

- `scheduling.ts` - Schedule generation algorithm (`generateWeekSchedule`)
- `notifications.ts` - Push notifications via FCM (`sendNotification`, `sendBulkNotifications`)
- `bidding.ts` - Bid window management with mode system (`createBidWindow`, `resolveBidWindow`, `instantAssign`)
- `confirmations.ts` - Mandatory shift confirmations (`confirmShift`, `getUnconfirmedAssignments`, `calculateConfirmationDeadline`)
- `flagging.ts` - Driver performance flagging (`checkDriverForFlagging`)
- `metrics.ts` - Driver metrics calculation (`recalculateDriverMetrics`)
- `managers.ts` - Manager access control (`getManagerWarehouseIds`, `canManagerAccessWarehouse`, `getRouteManager`)
- `health.ts` - Driver health scoring and star progression (`computeDailyScore`, `evaluateWeek`, `runDailyHealthEvaluation`, `runWeeklyHealthEvaluation`)

See `documentation/agent-guidelines.md` for detailed usage patterns.

For deeper conventions and patterns, start at `documentation/agent-guidelines/index.md`.

## Driver API Endpoints

Driver-facing endpoints in `src/routes/api/`:

- `GET /api/dashboard` - Driver dashboard overview (today's shift with arrivedAt/editableUntil/isArrivable, week summaries, metrics, pending bids, unconfirmed shifts)
- `GET /api/driver-health` - Driver health state (score, stars, streak, hard-stop flags, next milestone, simulation rewards, recent score history; neutral onboarding state for new drivers)
- `GET /api/notifications` - In-app notifications list (paginated)
- `PATCH /api/notifications/[id]/read` - Mark notification as read
- `POST /api/notifications/mark-all-read` - Mark all notifications as read
- `POST /api/assignments/[id]/confirm` - Confirm an upcoming shift (7 days to 48h before)
- `POST /api/shifts/arrive` - Signal on-site arrival for today's confirmed assignment (creates shift record, must be before route start time)
- `POST /api/shifts/start` - Record starting parcel inventory (sets parcelsStart on existing shift after arrival)
- `POST /api/shifts/complete` - Complete shift (takes parcelsReturned + optional exceptedReturns/exceptionNotes, server calculates delivered, sets 1-hour edit window)
- `PATCH /api/shifts/[assignmentId]/edit` - Edit parcel counts and exception fields within 1-hour window after completion

## Manager API Endpoints

Manager-facing endpoints in `src/routes/api/`. All manager endpoints are **organization-scoped** — managers can only access users, resources, and data belonging to their organization.

### Driver Management (Org-Scoped)

- `GET /api/drivers` - List all drivers in manager's organization with health state and metrics
- `PATCH /api/drivers/[id]` - Update driver attributes (weeklyCap, flags, reinstatement) — org-scoped; verifies target driver belongs to manager's organization
- `GET /api/drivers/[id]/shifts` - Get all completed and cancelled shift records for a specific driver (includes parcel counts, timestamps, exception notes) — org-scoped; verifies driver and shifts belong to manager's organization
- `GET /api/drivers/[id]/health` - Retrieve driver health state (score, stars, hard-stop flags, recent history) — org-scoped; verifies target driver belongs to manager's organization

### Admin Operations (Org-Scoped)

- `POST /admin/reset-password` - Manager-only password reset form action — org-scoped; verifies target user email belongs to manager's organization

### Onboarding & Approvals (Org-Scoped)

- `GET /api/onboarding` - List org-scoped signup onboarding entries with createdByName (manager whitelist)
- `POST /api/onboarding` - Create org-scoped email approval for driver signup (kind: 'approval', email)
- `PATCH /api/onboarding/[id]/revoke` - Revoke a pending/reserved onboarding entry (org-scoped)
- `PATCH /api/onboarding/[id]/restore` - Restore a revoked onboarding entry (org-scoped)

### Reports (Org-Scoped)

- `GET /api/weekly-reports` - Aggregated parcel delivery totals per operational week (billing summary) — org-scoped to manager's warehouses
- `GET /api/weekly-reports/[weekStart]` - Individual shift records for a specific week (weekStart must be a Monday) — org-scoped to manager's warehouses

## UI Components

Available in `src/lib/components/`:

- `app-shell/` - AppSidebar, PageHeader, SidebarItem, OfflineBanner
- `primitives/` - Button, Modal, Checkbox, Chip, Toggle, etc.
- `data-table/` - Full TanStack table system with filtering, pagination
- `icons/` - Icon components
- `driver/` - HealthCard (health score, stars, streak, simulation preview), CancelShiftModal
- `DriverShiftHistoryTable.svelte` - Driver shift history table (used on manager drivers page, fetches from `/api/drivers/[id]/shifts`)
- `WeeklyReportDetailTable.svelte` - Weekly report detail table (used on manager weekly reports page, fetches from `/api/weekly-reports/[weekStart]`)
- Combobox, Select, DatePicker, ConfirmationDialog, ToastContainer

**Shared Types** (`src/lib/schemas/`):

- `health.ts` - `HealthResponse` type for `/api/driver-health` endpoint and HealthCard component
- `driverShiftHistory.ts` - `DriverShiftRecord` and `DriverShiftHistoryResponse` types for `/api/drivers/[id]/shifts` endpoint and DriverShiftHistoryTable component
- `weeklyReports.ts` - `WeekSummary`, `WeekShiftRecord`, `WeeklyReportsResponse`, `WeekDetailResponse` types for weekly reports endpoints and components

### Theme System

Dark/light theme toggle with localStorage persistence and no-flash bootstrap.

**Utilities** (`src/lib/utils/theme.ts`):

- `applyTheme(theme: 'dark' | 'light')` - Apply theme to DOM and persist to localStorage
- `getDomTheme()` - Read currently applied theme
- `getStoredTheme()` - Read persisted theme from localStorage

**Implementation**:

- Theme attribute: `html[data-theme="dark"|"light"]`
- No-flash bootstrap: `src/app.html` applies stored theme before first paint
- Color tokens automatically switch via CSS custom properties in `src/app.css`

**Usage**:

```typescript
import { applyTheme, getDomTheme } from '$lib/utils/theme';

// Toggle theme
const current = getDomTheme() ?? 'dark';
applyTheme(current === 'dark' ? 'light' : 'dark');
```

## State Stores

Svelte 5 stores in `src/lib/stores/`:

- `dashboardStore.svelte.ts` - Driver dashboard state (shift data, metrics, pending bids)
- `notificationsStore.svelte.ts` - Notification inbox state (list, unread count)
- `whitelistStore.svelte.ts` - Manager whitelist/onboarding entries (load, create approval, revoke)

## Assets

**Logo**: Placeholder needed (`static/logo.png`). Will be replaced with actual logo when provided.

## Implementation Order (Suggested)

1. **Project setup**: SvelteKit + Drizzle + Neon + Better Auth + Observability ✓
2. **Core data model**: Users, Routes, Warehouses, Assignments ✓
3. **Auth flow**: Better Auth setup ✓
4. **Manager dashboard**: Routes CRUD ✓, Warehouses CRUD ✓
5. **Driver app**: Preferences UI ✓, Dashboard ✓, schedule view with shift lifecycle ✓
6. **Scheduling engine**: Core algorithm ✓ (`services/scheduling.ts`), cron integration pending
7. **Bidding system**: Bid windows ✓, scoring algorithm ✓, mode system ✓ (competitive/instant/emergency)
8. **Shift confirmations**: Mandatory 48h confirmation ✓, auto-drop ✓, reminders ✓
9. **Capacitor wrapper**: Push notifications
10. **Cron jobs**: Lock preferences, close bid windows ✓, metrics, auto-drop unconfirmed ✓, confirmation reminders ✓, health daily/weekly ✓

## Key Business Rules

### Scheduling

- Preferences lock Sunday 23:59 Toronto time
- Schedule generates for 2 weeks out
- New drivers wait ~2 weeks for scheduled shifts (can bid immediately)

### Shift Confirmations

- Every shift must be manually confirmed by the driver
- Confirmation window: 7 days to 48 hours before shift
- 72h before: reminder notification sent
- 48h before: unconfirmed shifts auto-dropped and reopened for bidding

### Arrival & Shift Lifecycle

- Each route has a configurable `startTime` (default 09:00). Drivers must arrive by that time on shift day
- No-show auto-detected by cron at route start time → triggers emergency bid window
- After completing shift, driver has **1-hour edit window** to correct parcel counts
- Drivers can declare returned parcels as **exceptions** (holidays, closures) that don't count against health scoring
- Shift flow: Confirm → Arrive → Start (parcelsStart) → Complete (parcelsReturned + exceptedReturns) → Edit window

### Weekly Caps

- Default: 4 days/week
- After 20 shifts with 95%+ attendance: 6 days/week
- Manager can manually adjust

### Flagging

- Before 10 shifts: flag if attendance < 80%
- After 10 shifts: flag if attendance < 70%
- 1 week grace period to improve
- If still below: lose 1 day from cap

### Driver Health System

- **Score**: 0-100 daily health score (attendance 50%, completion 30%, reliability 20%)
- **Hard Stop**: No-shows or 2+ late cancellations in 30 days cap score at 49 and reset stars to 0
- **Stars**: 0-4 weekly streak progression based on qualifying weeks (100% attendance, 95%+ completion, 0 no-shows, 0 late cancellations)
- **Pool Eligibility**: Hard-stop events remove driver from assignment pool (manager intervention required)
- **V1 Scope**: UI + simulation only (no automatic pay/cap changes yet)
- **Simulation**: 4 stars shows +10% bonus preview and higher shift access tier
- See `documentation/plans/driver-health-gamification.md` for full specification

### Bidding Modes

**Competitive** (> 24h before shift):

- Window closes 24h before shift
- Multiple drivers can bid
- Winner selected by score
- If no bids: transitions to instant mode

**Instant** (<= 24h before shift):

- Window closes at shift start
- First to accept wins immediately
- No scoring, no waiting

**Emergency** (manager-triggered or no-show):

- Always instant-assign
- Optional pay bonus (default 20%)
- Closes at shift start or end of day

### Bid Scoring (Competitive Mode)

```
score = (health * 0.45) +
        (familiarity * 0.25) +
        (seniority * 0.15) +
        (preference * 0.15)
```

- **Health**: `min(driverHealthState.currentScore / 96, 1)` — composite quality signal
- **Familiarity**: `min(routeCompletions.completionCount / 20, 1)` — route experience
- **Seniority**: `min(tenureMonths / 12, 1)` — loyalty reward
- **Preference**: Binary — route in driver's top 3 preferred → 1, else 0

### Dispatch Policy Configuration

All business rule constants centralized in `src/lib/config/dispatchPolicy.ts`:

- `timezone` - Toronto/Eastern time settings
- `shifts` - Shift timing (default 9 AM start, per-route arrival deadline, 1-hour edit window)
- `scheduling` - Schedule generation parameters
- `confirmation` - Confirmation windows and deadlines
- `bidding` - Bid scoring weights and mode cutoffs
- `flagging` - Attendance thresholds, grace periods, weekly cap rules
- `health` - Health score weights, hard-stop caps, qualifying week criteria, star progression
- `jobs` - Batch sizes for cron jobs

See `dispatchPolicy.health` for driver health gamification parameters (score weights, elite threshold, qualifying week criteria, etc.).

## Development Notes

### Git Workflow

**All PRs target `develop`.** Never create a PR with `--base main`. The only PRs targeting `main` are deploy merges from `develop`. This applies to every agent, every bead, every label — no exceptions.

### Time Zone

All operations in Toronto/Eastern time. Server time = local time.

### Offline Strategy

**Service Worker Caching** (`src/service-worker.ts`):

- Stale-while-revalidate strategy for read-only API endpoints
- Cached endpoints: `/api/assignments/mine`, `/api/preferences`, `/api/metrics`, `/api/dashboard`
- Automatic cache refresh on reconnection

**Connectivity Guards** (`src/lib/stores/helpers/connectivity.ts`):

- All write operations (create, update, delete) require connectivity
- `ensureOnlineForWrite()` - Shows toast error if offline, returns false
- Used in all stores before mutations (bids, preferences, assignments, etc.)

**UI Indicators**:

- `OfflineBanner` component displays when `navigator.onLine` is false
- No offline write queue - actions fail fast with clear messaging

**Pattern**:

```typescript
import { ensureOnlineForWrite } from '$lib/stores/helpers/connectivity';

async function submitBid(assignmentId: string) {
  if (!ensureOnlineForWrite()) {
    return false; // Toast shown automatically
  }

  // Proceed with mutation
  await fetch('/api/bids', { method: 'POST', ... });
}
```

### Mobile

- 99% of driver usage is mobile
- Design mobile-first, desktop works but not primary
- Internal distribution only (TestFlight/APK, no App Store review)

## Environment Variables

Reference: `.env.example` for full documentation.

| Variable                       | Purpose                                             | Required  |
| ------------------------------ | --------------------------------------------------- | --------- |
| `DATABASE_URL`                 | Neon PostgreSQL connection (pooled)                 | Yes       |
| `BETTER_AUTH_SECRET`           | Session signing key                                 | Yes       |
| `BETTER_AUTH_URL`              | App base URL — local dev only, Vercel auto-provides | Dev only  |
| `BETTER_AUTH_SIGNUP_POLICY`    | Signup onboarding mode (`allowlist` or `open`)      | No        |
| `BETTER_AUTH_SIGNUP_ALLOWLIST` | Approved signup emails (comma-separated)            | Prod only |
| `BETTER_AUTH_INVITE_CODE`      | Optional dev-only invite code                       | Dev only  |
| `FIREBASE_PROJECT_ID`          | FCM project identifier                              | Yes       |
| `FIREBASE_CLIENT_EMAIL`        | FCM service account email                           | Yes       |
| `FIREBASE_PRIVATE_KEY`         | FCM service account private key                     | Yes       |
| `AXIOM_TOKEN`                  | Axiom API token for log shipping                    | Prod only |
| `AXIOM_DATASET`                | Optional Axiom dataset (defaults to `driver-ops`)   | No        |
| `TEST_USER_EMAIL`              | Dev/test user email                                 | Dev only  |
| `TEST_USER_PASSWORD`           | Dev/test user password                              | Dev only  |

### Usage in Code

```typescript
// Database (via Drizzle)
import { DATABASE_URL } from '$env/static/private';

// Better Auth
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$env/static/private';

// Firebase Admin SDK
import {
	FIREBASE_PROJECT_ID,
	FIREBASE_CLIENT_EMAIL,
	FIREBASE_PRIVATE_KEY
} from '$env/static/private';
```

### Production (Vercel)

Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and Firebase vars in Vercel Dashboard.
`BETTER_AUTH_URL` is **not needed** — auto-detected from `VERCEL_URL`.

### Better Auth Implementation

URL auto-detection pattern (already in `src/lib/server/auth.ts`):

```typescript
function getAuthBaseUrl(): string {
	if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
	if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
	throw new Error('BETTER_AUTH_URL or VERCEL_URL must be set');
}
```

Trusted origins are environment-scoped:

- development defaults to localhost origins (with optional dev-only overrides)
- preview uses explicit `https://${VERCEL_URL}`
- production requires explicit canonical origins (no wildcard patterns)

### Firebase Configuration

Firebase has **two separate configs** — don't confuse them:

**Server-side (Admin SDK)** — for sending push notifications from SvelteKit:

- Stored in `.env` as `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- From: Firebase Console > Project Settings > Service Accounts > Generate new private key
- Used in server routes only (`$env/static/private`)

**Client-side (Web SDK)** — for receiving push in browser/Capacitor:

```typescript
// Store in src/lib/firebase.ts (NOT in .env — these are public)
const firebaseConfig = {
	apiKey: 'AIza...',
	authDomain: 'project.firebaseapp.com',
	projectId: 'project-id',
	storageBucket: 'project.firebasestorage.app',
	messagingSenderId: '123456789',
	appId: '1:123456789:web:abc123'
};
```

- From: Firebase Console > Project Settings > General > Your apps > Web app
- These are **public** (shipped to browser) — not secrets

### Observability (Pino + Axiom)

Structured logging using Pino with Axiom transport for production log shipping.

**Development**: Pretty-printed colored logs to console (no Axiom required)
**Production**: JSON logs shipped to Axiom (`AXIOM_DATASET` or default `driver-ops`)

```typescript
// Basic usage
import logger from '$lib/server/logger';
logger.info({ userId, action: 'login' }, 'User logged in');

// With context (child logger)
import { createContextLogger } from '$lib/server/logger';
const log = createContextLogger({ userId: '123', operation: 'createBid' });
log.info({ bidId }, 'Bid created');
log.error({ error: err.message }, 'Bid failed');

// Redact sensitive fields before logging
import { redactSensitive } from '$lib/server/logger';
log.info(redactSensitive(userData), 'User data');
```

Setup: Get Axiom token from Axiom Console > Settings > API Tokens. Set `AXIOM_TOKEN` in Vercel (and optional `AXIOM_DATASET`).
