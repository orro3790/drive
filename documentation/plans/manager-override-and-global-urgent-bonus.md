# Manager Override + Global Urgent Bonus Plan

Task: make route override behavior explicit and add a manager-editable global urgent bonus rate.

## Problem Summary

1. The current "Reopen" action is ambiguous in UI and behavior.
2. The frontend currently only shows reopen in some unfilled states, while backend can unassign assigned routes in emergency reopen flows.
3. The urgent bonus percent is hardcoded via `dispatchPolicy.bidding.emergencyBonusPercent` and cannot be adjusted from settings.

## Goals

1. Give managers explicit override tools for assigned routes:
   - reassign directly to another driver
   - unassign and open urgent bidding
2. Make unfilled-route actions semantically clear (no confusing "reopen" wording).
3. Add a global, runtime-editable urgent bonus percent in manager settings.
4. Ensure no-show penalties are only applied by no-show automation, not by manual manager overrides.

## Non-Goals

1. No per-warehouse or per-route bonus rates (global only).
2. No rewrite of bidding scoring logic.
3. No changes to driver-facing bid acceptance rules.

## Product Decisions (Locked)

1. Bonus scope: global.
2. Manager override does not increment displaced driver's no-show metrics.
3. "Reopen" is replaced by explicit action wording in route detail flows.
4. Assignment lifecycle terms (`scheduled`, `unfilled`, etc.) are the source of truth; UI chip label `assigned` is display-only.
5. No-show flow must send a single driver notification fanout (no duplicate emergency notification sends).

## Data Model Changes

Add a singleton-style dispatch settings table.

- File: `src/lib/server/db/schema.ts`
- New table: `dispatch_settings`
- Fields:
  - `id` (`text`, primary key, fixed logical row key like `global`)
  - `emergencyBonusPercent` (`integer`, default `20`)
  - `updatedBy` (`text`, nullable FK to auth user)
  - `updatedAt` (`timestamp with timezone`, default now)

Migration work:

- Add SQL migration in `drizzle/` for table creation.
- Enforce singleton row strategy (`id = 'global'`) and `ON CONFLICT` upsert behavior.
- Seed/initialize global row with default 20 if missing (service-level upsert-on-read/write).

## Schema + Validation

Add manager-dispatch settings schemas.

- New file: `src/lib/schemas/dispatch-settings.ts`
- Validation:
  - `emergencyBonusPercent`: integer, range `0..100`

## Backend Service Layer

Create a dispatch settings service.

- New file: `src/lib/server/services/dispatchSettings.ts`
- Functions:
  - `getDispatchSettings()`
  - `updateDispatchSettings({ emergencyBonusPercent, actorId })`
  - `getEmergencyBonusPercent()`

Behavior:

- Reads from DB row; if missing, returns default + creates row.
- Becomes source-of-truth for runtime urgent bonus.
- If DB read fails, falls back to `dispatchPolicy.bidding.emergencyBonusPercent` for safe operation.

## API Changes

### 1) Manager Dispatch Settings API

- New route: `src/routes/api/settings/dispatch/+server.ts`
- `GET` (manager-only): returns current global dispatch settings.
- `PATCH` (manager-only): updates `emergencyBonusPercent`.

### 2) Assignment Override API

Add explicit override endpoint for manager assignment actions.

- New route: `src/routes/api/assignments/[id]/override/+server.ts`
- Body shape:
  - `{ action: 'reassign', driverId: string }`
  - `{ action: 'open_bidding' }`
  - `{ action: 'open_urgent_bidding' }`

Action/state matrix (assignment-level, not coarse route chip only):

1. `reassign`
   - Allowed: `scheduled`, `unfilled`
   - Rejected: `active`, `completed`, `cancelled`
2. `open_bidding`
   - Allowed: `unfilled` with no open bid window and shift not passed
   - Rejected: all other states
3. `open_urgent_bidding`
   - Allowed: `scheduled`, `unfilled`, `bidding`
   - Rejected: `active`, `completed`, `cancelled`
   - If already `bidding` in non-emergency mode, escalate window to emergency mode
   - If already emergency/open, treat as idempotent success

Rules:

1. Manager warehouse access required.
2. Completed/cancelled/active assignments cannot be overridden.
3. `reassign` can replace scheduled driver or assign unfilled route.
4. `open_bidding` valid for unfilled routes without open window and before shift-start.
5. `open_urgent_bidding` can unassign scheduled routes and open emergency window using global bonus percent.
6. No no-show metric updates in manager override path.
7. API returns normalized assignment + bid-window payload for deterministic store updates.

Response contract (required):

- `assignment`: `{ id, status, userId, driverName, routeId }`
- `bidWindow`: `{ id, mode, status, closesAt, payBonusPercent } | null`
- `notifiedCount`: `number | null`
- `action`: echoed action string

Error contract (required):

- `409 invalid_assignment_state`
- `409 open_window_exists`
- `404 assignment_not_found`
- `403 forbidden`
- `400 validation_failed`

Implementation notes:

- Reuse/extend `manualAssignDriverToAssignment` in `src/lib/server/services/assignments.ts`.
- Reuse `createBidWindow` in `src/lib/server/services/bidding.ts`.
- If an open non-emergency window exists when urgent override is requested, close/replace it with emergency mode (single open window invariant preserved).
- Forced escalation must define pending-bid outcome (`lost`), audit events, and manager SSE updates.

## Existing Endpoint Adjustments

Update existing emergency/no-show flows to use runtime bonus.

1. `src/routes/api/assignments/[id]/emergency-reopen/+server.ts`
   - Replace direct `dispatchPolicy.bidding.emergencyBonusPercent` reads with `getEmergencyBonusPercent()`.
   - Deprecate this endpoint in favor of `/api/assignments/[id]/override` for manager UI flows.
   - Keep temporary compatibility wrapper that delegates to override action until callers are migrated.
2. `src/lib/server/services/noshow.ts`
   - Use runtime bonus from dispatch settings service for emergency windows/notifications.
   - Ensure exactly one driver notification fanout path in no-show flow (owned by one service path only).
3. `src/lib/stores/routeStore.svelte.ts`
   - Migrate emergency reopen calls from legacy endpoint to `/override`.

Route list/detail payload adjustment:

- Extend manager routes API responses in `src/routes/api/routes/+server.ts` and `src/routes/api/routes/[id]/+server.ts` to include assignment lifecycle fields used by action gating:
  - `assignmentStatus` (`scheduled | active | completed | cancelled | unfilled | null`)
  - `isShiftStarted` (derived from date + route start time)

## Manager UI Changes (`/routes`)

File: `src/routes/(manager)/routes/+page.svelte`

1. Keep header icon actions (`Edit`, `Delete`) left of close.
2. Replace ambiguous footer behavior with explicit actions by assignment lifecycle state:
   - Scheduled:
     - `Open Urgent Bidding` (ghost, left)
     - `Assign Driver` (right, acts as reassign)
   - Unfilled with no window and not started:
     - `Open Bidding`
     - `Assign Driver`
   - Unfilled after shift start:
     - `Open Urgent Bidding`
     - `Assign Driver`
   - Bidding:
     - `Open Urgent Bidding` (escalation)
     - `Assign Driver` (right)
   - Active/Completed/Cancelled:
     - no override actions shown
3. Confirmation copy must describe consequences (unassign current driver if present, urgent bonus value shown).

Store updates:

- `src/lib/stores/routeStore.svelte.ts`
  - Add override methods mapped to `/api/assignments/[id]/override`.
  - Keep optimistic UI updates aligned with returned assignment/window state.

## Manager Settings UI (Global Bonus)

Add manager-only dispatch settings section.

- New component: `src/lib/components/settings/ManagerDispatchSection.svelte`
- Mount in `src/routes/(app)/settings/+page.svelte` for managers.
- Control: numeric input for `Urgent bonus (%)` with inline validation and save feedback.
- On save success, subsequent manager reopen/no-show-triggered urgent windows use the updated value.

## Copy and i18n

Update/add message keys in:

- `messages/en.json`
- `messages/zh.json`
- `messages/zh-Hant.json`

Key areas:

- action labels (`Open Urgent Bidding`, `Open Bidding`, `Reassign Driver` if used)
- confirmation text
- settings labels and validation errors

## Testing Plan

Because this changes assignment state transitions and bidding behavior, add coverage in server + store tests.

Server tests:

1. `tests/server/assignmentsService.test.ts`
   - scheduled -> reassign success path
   - scheduled -> urgent reopen path unassigns without no-show penalty
   - unfilled -> open bidding
   - rejects active/completed/cancelled override attempts
2. New API tests:
   - `tests/server/dispatchSettingsApi.test.ts`
   - `tests/server/assignmentOverrideApi.test.ts`
   - include response-shape assertions and error-code assertions
3. `tests/server/noShowDetectionService.test.ts`
   - verifies runtime bonus is read from dispatch settings
   - verifies no-show emits one emergency notification fanout only
4. `tests/server/biddingService.test.ts`
   - escalation path closes/replaces open non-emergency window and resolves pending bids

Store tests:

1. `tests/stores/routeStore.test.ts`
   - override action response mapping and state updates
   - legacy endpoint compatibility removed after migration

## Rollout Sequence

1. Add DB table + migration.
2. Add dispatch settings service + API.
3. Add override API + service extensions.
4. Switch emergency/no-show flows to runtime bonus provider.
5. Update routes detail panel actions/copy.
6. Add manager dispatch settings UI.
7. Add tests and run full checks.

## Verification Checklist

1. `pnpm check` passes.
2. Relevant tests pass (assignments, bidding, no-show, route store, new APIs).
3. Assigned route detail shows override actions; assign button remains on right.
4. Unfilled route no longer shows confusing "reopen" action.
5. Updating global urgent bonus in settings changes value used by urgent reopen/no-show notifications without code changes.
6. Manager override does not increment no-show metrics for displaced drivers.
