# Drive System Overview

Drive is an event-driven operations platform for delivery logistics: a mobile-first driver app plus a manager dashboard for scheduling, replacement bidding, and performance tracking.

## 1. Core Users

- **Drivers**: view schedules, bid on open shifts, start/complete shifts, receive notifications.
- **Managers**: manage warehouses and routes, monitor schedules, resolve exceptions.

## 2. Product Pillars

- **Automation**: scheduling runs in the background; managers handle exceptions.
- **Fair replacement**: replacement shifts use bidding (not first-come-first-served).
- **Reliability metrics**: attendance/completion drive caps and flagging.
- **Mobile-first**: most usage is on phones; desktop supports managers.

## 3. Key Business Rules (high level)

- **Scheduling**: 2-week lookahead; driver preferences lock Sunday 23:59 Toronto time.
- **Weekly caps**: default 4 days/week; increases with reliability; managers can override.
- **Flagging**: attendance thresholds change as a driver accrues shifts; flagged drivers lose access/cap.
- **Bidding**: scoring combines completion, familiarity, attendance, and preference bonus.

## 4. UX & Navigation (SvelteKit route groups)

- `(auth)`: sign-in/sign-up/password reset flows.
- `(driver)`: driver dashboard, schedule, bids.
- `(manager)`: warehouses, routes, admin reset-password.
- `(app)`: shared authenticated surfaces (e.g., settings).

## 5. Architecture Highlights

- **Frontend**: SvelteKit + TypeScript + Svelte 5 runes.
- **Database**: Postgres (Neon) via Drizzle (`src/lib/server/db/`).
- **Auth**: Better Auth (`src/lib/server/auth.ts`, `src/hooks.server.ts`).
- **Notifications**: Firebase Cloud Messaging for push (`src/lib/server/services/notifications.ts`).
- **Scheduling**: server-side service (`src/lib/server/services/scheduling.ts`).
- **Observability**: Pino logger with Axiom shipping (`src/lib/server/logger.ts`).

## 6. Related Documentation

- Drive agent guide: `documentation/agent-guidelines.md`
- Deep-dive index: `documentation/agent-guidelines/index.md`
