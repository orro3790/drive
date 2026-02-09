# DRV-hao Nightly Audit - Shift Lifecycle API Endpoints

Date: 2026-02-10
Task: DRV-hao

## Scope

- `src/routes/api/shifts/arrive/+server.ts`
- `src/routes/api/shifts/start/+server.ts`
- `src/routes/api/shifts/complete/+server.ts`
- `src/routes/api/shifts/[assignmentId]/edit/+server.ts`
- Supporting contracts: `src/lib/schemas/shift.ts`, `src/lib/server/services/assignmentLifecycle.ts`, `documentation/agent-guidelines.md`

## Findings Summary

- High: 1
- Medium: 1
- Low: 1

## Findings

### HIGH - 9 AM arrival deadline is not enforced in runtime lifecycle/API checks

- Evidence:
  - `documentation/agent-guidelines.md:606` states arrival "must be called before 9:00 AM Toronto time"
  - `src/lib/server/services/assignmentLifecycle.ts:106`-`src/lib/server/services/assignmentLifecycle.ts:110` marks `isArrivable` using only date/status/confirmation/arrived state (no clock cutoff)
  - `src/routes/api/shifts/arrive/+server.ts:85`-`src/routes/api/shifts/arrive/+server.ts:87` relies on lifecycle gate and has no explicit deadline check
  - `tests/server/shiftsArriveApi.test.ts:343`-`tests/server/shiftsArriveApi.test.ts:374` validates a success path at `2026-02-09T15:00:00.000Z` (10:00 Toronto in February)
- Impact: Drivers can still signal arrival after the stated 9 AM cutoff, weakening no-show policy enforcement and creating contract drift versus documented behavior.
- Recommendation: Add an explicit Toronto-time deadline guard to arrival eligibility (in lifecycle and/or route), then add failing tests for post-9:00 AM attempts.

### MEDIUM - Documented arrival precondition errors (400) are collapsed into generic lifecycle 409 path

- Evidence:
  - `documentation/agent-guidelines.md:627` documents `400` for "not today's shift, must be before 9 AM, or assignment must be confirmed first"
  - `src/routes/api/shifts/arrive/+server.ts:85`-`src/routes/api/shifts/arrive/+server.ts:87` returns `409` with a single message (`Assignment is not ready for arrival`) for all lifecycle-denied states
- Impact: Clients cannot distinguish invalid preconditions from state conflicts as documented; error handling and UX messaging become harder to align with contract expectations.
- Recommendation: Map lifecycle denial reasons to documented status classes/messages (including specific 400 cases for time/date/confirmation preconditions).

### LOW - Success payload shape is inconsistent across shift lifecycle endpoints

- Evidence:
  - `src/routes/api/shifts/arrive/+server.ts:144` returns `{ success: true, arrivedAt }`
  - `src/routes/api/shifts/start/+server.ts:134` returns `{ shift, assignmentStatus }` (no `success`)
  - `src/routes/api/shifts/complete/+server.ts:199` returns `{ shift, assignmentStatus }` (no `success`)
  - `src/routes/api/shifts/[assignmentId]/edit/+server.ts:138` returns `{ success: true, shift }`
- Impact: Consumers need per-endpoint branching for nominal success detection instead of using a normalized response envelope.
- Recommendation: Standardize to a single success envelope pattern (or codify endpoint-specific response contracts in generated client types and docs).

## Checks Completed (No Immediate Defect Found)

- Authentication and role guards are present on all four endpoints (`401` unauthenticated and `403` role/ownership paths).
- Driver ownership enforcement exists before mutation in all endpoints.
- Zod validation is applied for body payloads (`shiftArriveSchema`, `shiftStartSchema`, `shiftCompleteSchema`, `shiftEditSchema`).
- Duplicate-arrival and duplicate-start/complete protections are present via shift-state checks (`409` paths).
- `parcelsStart` and `parcelsReturned` boundaries and cross-field guard (`returned <= start`) are enforced before writes.
- Completion endpoint computes `editableUntil` using configured one-hour policy (`dispatchPolicy.shifts.completionEditWindowHours`), and edit endpoint enforces expiry.

## Priority Fix Order

1. Enforce 9 AM Toronto arrival cutoff in lifecycle/API logic and tests.
2. Align arrival error status/message mapping with documented 400 vs 409 semantics.
3. Normalize success payload contracts across shift lifecycle endpoints.
