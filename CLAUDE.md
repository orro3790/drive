# Drive

Driver Operations Platform for delivery logistics.

**App Name**: Drive
**Repo**: `orro3790/drive`

## Project Status: Ready for Implementation

Tech stack interview **completed**. Specifications documented in `docs/specs/`. Ready to begin implementation.

## Quick Reference

| Layer | Technology |
|-------|------------|
| Frontend | SvelteKit + TypeScript |
| Mobile | Capacitor (native push) |
| Database | PostgreSQL (Neon) + Drizzle |
| Auth | Better Auth |
| Hosting | Vercel |
| Push | Firebase Cloud Messaging |
| Cron | Vercel Cron |
| Real-time | SSE |
| Observability | Pino + Axiom |

## Domain Context

**What we're building**: Event-driven operations automation platform for delivery logistics.

**Core capabilities**:
- Automatic driver-to-route scheduling (2-week lookahead, Sunday lock)
- Bidding-based replacement system (not FCFS)
- Performance tracking with reliability-based flagging
- Mobile-first driver app + manager dashboard

**What it is NOT**: A marketplace, HR system, routing/navigation engine, or payroll system.

## Key Documents

| Document | Location |
|----------|----------|
| Technical Spec | `docs/specs/tech-stack.md` |
| Data Model | `docs/specs/data-model.md` |
| Agent Guidelines | `docs/agent-guidelines.md` |
| Domain Context | `non-technical-specs.md`, `project-summary-condensed.md` |
| ADR: Tech Stack | `docs/adr/001-tech-stack.md` |
| ADR: Bidding System | `docs/adr/002-replacement-bidding-system.md` |
| ADR: Scheduling | `docs/adr/003-scheduling-model.md` |

## UI Components

Available in `src/lib/components/`:
- `app-shell/` - AppSidebar, PageHeader, SidebarItem
- `primitives/` - Button, Modal, Checkbox, Chip, Toggle, etc.
- `data-table/` - Full TanStack table system with filtering, pagination
- `icons/` - Icon components
- Combobox, Select, DatePicker, ConfirmationDialog, ToastContainer

## Assets

**Logo**: Placeholder needed (`static/logo.png`). Will be replaced with actual logo when provided.

## Implementation Order (Suggested)

1. **Project setup**: SvelteKit + Drizzle + Neon + Better Auth + Observability ✓
2. **Core data model**: Users, Routes, Warehouses, Assignments
3. **Auth flow**: Better Auth setup ✓
4. **Manager dashboard**: Route table with filters, CRUD
5. **Driver app**: Dashboard, preferences, schedule view
6. **Scheduling engine**: Preference lock, auto-assignment
7. **Bidding system**: Bid windows, scoring algorithm, resolution
8. **Capacitor wrapper**: Push notifications
9. **Cron jobs**: Lock preferences, close bid windows, metrics

## Key Business Rules

### Scheduling
- Preferences lock Sunday 23:59 Toronto time
- Schedule generates for 2 weeks out
- New drivers wait ~2 weeks for scheduled shifts (can bid immediately)

### Weekly Caps
- Default: 4 days/week
- After 20 shifts with 95%+ attendance: 6 days/week
- Manager can manually adjust

### Flagging
- Before 10 shifts: flag if attendance < 80%
- After 10 shifts: flag if attendance < 70%
- 1 week grace period to improve
- If still below: lose 1 day from cap

### Bid Scoring
```
score = (completion_rate * 0.4) +
        (route_familiarity * 0.3) +
        (attendance_rate * 0.2) +
        (preference_bonus * 0.1)
```

## Development Notes

### Time Zone
All operations in Toronto/Eastern time. Server time = local time.

### Offline Strategy
- Read operations: Cache locally
- Write operations: Require connectivity (show clear "no connection" state)

### Mobile
- 99% of driver usage is mobile
- Design mobile-first, desktop works but not primary
- Internal distribution only (TestFlight/APK, no App Store review)

## Environment Variables

Reference: `.env.example` for full documentation.

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection (pooled) | Yes |
| `BETTER_AUTH_SECRET` | Session signing key | Yes |
| `BETTER_AUTH_URL` | App base URL — local dev only, Vercel auto-provides | Dev only |
| `BETTER_AUTH_INVITE_CODE` | Optional signup gate for drivers | No |
| `FIREBASE_PROJECT_ID` | FCM project identifier | Yes |
| `FIREBASE_CLIENT_EMAIL` | FCM service account email | Yes |
| `FIREBASE_PRIVATE_KEY` | FCM service account private key | Yes |
| `AXIOM_TOKEN` | Axiom API token for log shipping | Prod only |
| `TEST_USER_EMAIL` | Dev/test user email | Dev only |
| `TEST_USER_PASSWORD` | Dev/test user password | Dev only |

### Usage in Code

```typescript
// Database (via Drizzle)
import { DATABASE_URL } from '$env/static/private';

// Better Auth
import { BETTER_AUTH_SECRET, BETTER_AUTH_URL } from '$env/static/private';

// Firebase Admin SDK
import { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } from '$env/static/private';
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

Trusted origins configured for localhost + `*.vercel.app` wildcard.

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
  apiKey: "AIza...",
  authDomain: "project.firebaseapp.com",
  projectId: "project-id",
  storageBucket: "project.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```
- From: Firebase Console > Project Settings > General > Your apps > Web app
- These are **public** (shipped to browser) — not secrets

### Observability (Pino + Axiom)

Structured logging using Pino with Axiom transport for production log shipping.

**Development**: Pretty-printed colored logs to console (no Axiom required)
**Production**: JSON logs shipped to Axiom dataset `driver-ops`

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

Setup: Get Axiom token from Axiom Console > Settings > API Tokens. Set `AXIOM_TOKEN` in Vercel.
