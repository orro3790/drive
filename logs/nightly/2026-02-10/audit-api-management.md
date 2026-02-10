# DRV-7x9 Nightly Audit - Assignment, Preference, Route, Warehouse, and Onboarding APIs

Date: 2026-02-10
Task: DRV-7x9

## Endpoint Manifest

- Assignments
  - `GET /api/assignments/mine` -> `src/routes/api/assignments/mine/+server.ts`
  - `POST /api/assignments/[id]/confirm` -> `src/routes/api/assignments/[id]/confirm/+server.ts`
  - `POST /api/assignments/[id]/cancel` -> `src/routes/api/assignments/[id]/cancel/+server.ts`
  - `POST /api/assignments/[id]/assign` -> `src/routes/api/assignments/[id]/assign/+server.ts`
  - `POST /api/assignments/[id]/emergency-reopen` -> `src/routes/api/assignments/[id]/emergency-reopen/+server.ts`
- Preferences
  - `GET /api/preferences` -> `src/routes/api/preferences/+server.ts`
  - `PUT /api/preferences` -> `src/routes/api/preferences/+server.ts`
  - `GET /api/preferences/routes` -> `src/routes/api/preferences/routes/+server.ts`
- Routes
  - `GET /api/routes` -> `src/routes/api/routes/+server.ts`
  - `POST /api/routes` -> `src/routes/api/routes/+server.ts`
  - `PATCH /api/routes/[id]` -> `src/routes/api/routes/[id]/+server.ts`
  - `DELETE /api/routes/[id]` -> `src/routes/api/routes/[id]/+server.ts`
- Warehouses
  - `GET /api/warehouses` -> `src/routes/api/warehouses/+server.ts`
  - `POST /api/warehouses` -> `src/routes/api/warehouses/+server.ts`
  - `GET /api/warehouses/[id]` -> `src/routes/api/warehouses/[id]/+server.ts`
  - `PATCH /api/warehouses/[id]` -> `src/routes/api/warehouses/[id]/+server.ts`
  - `DELETE /api/warehouses/[id]` -> `src/routes/api/warehouses/[id]/+server.ts`
  - `GET /api/warehouses/[id]/managers` -> `src/routes/api/warehouses/[id]/managers/+server.ts`
  - `POST /api/warehouses/[id]/managers` -> `src/routes/api/warehouses/[id]/managers/+server.ts`
  - `DELETE /api/warehouses/[id]/managers` -> `src/routes/api/warehouses/[id]/managers/+server.ts`
- Onboarding
  - `GET /api/onboarding` -> `src/routes/api/onboarding/+server.ts`
  - `POST /api/onboarding` -> `src/routes/api/onboarding/+server.ts`
  - `PATCH /api/onboarding/[id]/revoke` -> `src/routes/api/onboarding/[id]/revoke/+server.ts`

Supporting control-path files reviewed:

- `src/lib/server/services/confirmations.ts`
- `src/lib/server/services/assignmentLifecycle.ts`
- `src/lib/server/services/assignments.ts`
- `src/lib/server/services/managers.ts`
- `src/lib/server/services/onboarding.ts`
- `src/lib/server/auth-abuse-hardening.ts`
- `src/lib/config/dispatchPolicy.ts`
- `src/lib/server/db/schema.ts`
- `src/routes/api/cron/lock-preferences/+server.ts`

## Findings Summary

- Critical: 0
- High: 4
- Medium: 2
- Low: 1

## Findings

### HIGH - `PATCH /api/routes/[id]` allows cross-warehouse reassignment without authorization on the target warehouse

- Evidence:
  - Access check is only against the route's current warehouse (`src/routes/api/routes/[id]/+server.ts:99`, `src/routes/api/routes/[id]/+server.ts:100`).
  - If `warehouseId` is changed, code validates existence only, not manager access (`src/routes/api/routes/[id]/+server.ts:132`, `src/routes/api/routes/[id]/+server.ts:138`).
  - Update applies requested `warehouseId` directly (`src/routes/api/routes/[id]/+server.ts:157`, `src/routes/api/routes/[id]/+server.ts:160`).
- Severity rationale (`impact x likelihood`): High impact (manager can move routes into unauthorized warehouses and mutate cross-warehouse routing state) x medium likelihood (single API call with known UUID) = **High**.
- Recommendation: When `warehouseId` changes, run `canManagerAccessWarehouse(locals.user.id, updates.warehouseId)` before update and reject on failure.

### HIGH - Preference lock enforcement after Sunday is ineffective; drivers can keep editing after lock

- Evidence:
  - Lock check compares `lockedAt` to the _next_ Sunday deadline (`src/routes/api/preferences/+server.ts:60`, `src/routes/api/preferences/+server.ts:63`).
  - Deadline builder uses `Date#setHours` on server-local clock after Toronto weekday extraction, creating timezone drift risk (`src/routes/api/preferences/+server.ts:21`, `src/routes/api/preferences/+server.ts:47`).
  - Lock cron writes the _current/just-passed_ Sunday lock instant (`src/routes/api/cron/lock-preferences/+server.ts:33`, `src/routes/api/cron/lock-preferences/+server.ts:37`, `src/routes/api/cron/lock-preferences/+server.ts:51`, `src/routes/api/cron/lock-preferences/+server.ts:71`).
  - PUT gate depends on that lock check (`src/routes/api/preferences/+server.ts:138`).
- Severity rationale (`impact x likelihood`): High impact (preference freeze policy can be bypassed, affecting fairness and schedule generation assumptions) x high likelihood (normal post-lock usage) = **High**.
- Recommendation: Compute lock status from a Toronto-zoned current-cycle boundary (not next boundary), and compare `nowToronto` against a deterministic lock window token for the active scheduling cycle.

### HIGH - Late-cancellation detection is anchored to midnight math, not shift start time

- Evidence:
  - Shift start is explicitly configured (`07:00` local) (`src/lib/config/dispatchPolicy.ts:6`).
  - `calculateHoursUntilShift` uses calendar-day delta minus current minutes, omitting shift start hour (`src/lib/server/services/assignmentLifecycle.ts:63`, `src/lib/server/services/assignmentLifecycle.ts:66`).
  - Late-cancel flips at `<= 48h` based on that derived value (`src/lib/server/services/assignmentLifecycle.ts:92`, `src/lib/server/services/assignmentLifecycle.ts:93`).
  - Cancel API uses this flag to apply late-cancel penalties (`src/routes/api/assignments/[id]/cancel/+server.ts:84`, `src/routes/api/assignments/[id]/cancel/+server.ts:85`, `src/routes/api/assignments/[id]/cancel/+server.ts:102`).
- Severity rationale (`impact x likelihood`): High impact (attendance penalties and metrics can be applied hours early) x medium likelihood (boundary-period cancels are common operationally) = **High**.
- Recommendation: Derive `hoursUntilShift` from exact `shiftStart` timestamp (`assignmentDate + startHourLocal in Toronto`) and evaluate late-cancel against that timestamp.

### HIGH - Onboarding invite lifecycle remains non-atomic between authorization and consumption

- Evidence:
  - Production signup allowlist grants access before account creation (`src/lib/server/auth-abuse-hardening.ts:268`, `src/lib/server/auth-abuse-hardening.ts:274`).
  - Onboarding consumption is attempted only after successful signup response (`src/lib/server/auth-abuse-hardening.ts:312`, `src/lib/server/auth-abuse-hardening.ts:323`).
  - Failure to consume logs warning/error but does not block or rollback user creation (`src/lib/server/auth-abuse-hardening.ts:329`, `src/lib/server/auth-abuse-hardening.ts:338`).
  - Service returns `null` when pending invite/approval is no longer consumable (`src/lib/server/services/onboarding.ts:271`, `src/lib/server/services/onboarding.ts:295`).
- Severity rationale (`impact x likelihood`): High impact (production allowlist can admit unauthorized signup in race/revoke windows) x medium likelihood (concurrent signup/revoke and retry flows) = **High**.
- Recommendation: Make invite/approval consumption atomic with signup authorization (pre-reserve/consume in transaction-capable flow), or add compensating rollback when post-signup consume fails.

### MEDIUM - Input validation is inconsistent for malformed JSON and UUID params, creating avoidable 500 paths

- Evidence:
  - Multiple endpoints parse JSON without guard (`src/routes/api/assignments/[id]/cancel/+server.ts:36`, `src/routes/api/assignments/[id]/assign/+server.ts:19`, `src/routes/api/routes/+server.ts:157`, `src/routes/api/routes/[id]/+server.ts:74`, `src/routes/api/warehouses/+server.ts:149`, `src/routes/api/onboarding/+server.ts:35`, `src/routes/api/warehouses/[id]/managers/+server.ts:67`, `src/routes/api/warehouses/[id]/managers/+server.ts:107`).
  - Several handlers use unvalidated `[id]` params directly against UUID-backed columns (`src/routes/api/assignments/[id]/confirm/+server.ts:20`, `src/routes/api/assignments/[id]/cancel/+server.ts:35`, `src/routes/api/assignments/[id]/assign/+server.ts:26`, `src/routes/api/routes/[id]/+server.ts:73`, `src/routes/api/onboarding/[id]/revoke/+server.ts:15`).
  - Referenced DB columns are UUID-typed (`src/lib/server/db/schema.ts:83`, `src/lib/server/db/schema.ts:98`, `src/lib/server/db/schema.ts:144`, `src/lib/server/db/schema.ts:149`).
- Severity rationale (`impact x likelihood`): Medium impact (contract instability, noisy error telemetry, brittle client behavior) x high likelihood (malformed requests and stale clients happen in production) = **Medium**.
- Recommendation: Standardize request parsing with explicit invalid-JSON handling and validate path params with Zod UUID schemas before DB calls.

### MEDIUM - Error contract is not uniform across audited APIs

- Evidence:
  - Most handlers rely on thrown `error(status, message)` (`src/routes/api/routes/+server.ts:53`, `src/routes/api/warehouses/[id]/+server.ts:100`).
  - Onboarding duplicate cases return structured JSON error payloads (`src/routes/api/onboarding/+server.ts:47`, `src/routes/api/onboarding/+server.ts:62`).
  - Cron and other handlers in adjacent flow return yet another shape (`src/routes/api/cron/lock-preferences/+server.ts:46`).
- Severity rationale (`impact x likelihood`): Medium impact (frontend and automation clients must branch on incompatible error body shapes) x medium likelihood (all client error handling paths) = **Medium**.
- Recommendation: Define and enforce one error envelope for all API routes (for example `{ error: { code, message, details? } }`) and keep status-code mapping consistent.

### LOW - Warehouse delete behavior is protective, not cascading, and should be made explicit in control expectations

- Evidence:
  - API blocks delete when routes exist (`src/routes/api/warehouses/[id]/+server.ts:240`, `src/routes/api/warehouses/[id]/+server.ts:247`).
  - Schema cascades warehouse-manager links, but not route/assignment rows (`src/lib/server/db/schema.ts:118`, `src/lib/server/db/schema.ts:100`, `src/lib/server/db/schema.ts:154`).
- Severity rationale (`impact x likelihood`): Low impact (operational friction and expectation mismatch more than direct security/correctness break) x medium likelihood (admin cleanup workflows) = **Low**.
- Recommendation: Decide and document one model: explicit hard-block delete with operator guidance, or transactional cascade plan that preserves audit history safely.

## Checks Completed (No Immediate Defect Found)

- Manager-only gate is enforced on management routes (`src/routes/api/routes/+server.ts:52`, `src/routes/api/warehouses/+server.ts:42`, `src/routes/api/onboarding/+server.ts:18`).
- Driver-scoped access is enforced on assignment and preference self-service endpoints (`src/routes/api/assignments/mine/+server.ts:66`, `src/routes/api/assignments/[id]/cancel/+server.ts:59`, `src/routes/api/preferences/+server.ts:76`).
- Confirmation API delegates to service-level window checks for the 7d->48h model (`src/routes/api/assignments/[id]/confirm/+server.ts:20`, `src/lib/server/services/confirmations.ts:103`).
- Route list/read flow scopes visibility to manager warehouse memberships (`src/routes/api/routes/+server.ts:71`, `src/routes/api/routes/+server.ts:79`).

## Control Matrix (`control -> endpoint -> evidence -> verdict -> confidence -> remediation`)

| Control                                       | Endpoint(s)                                                                                                  | Evidence                                                                                                                                                                                           | Verdict | Confidence | Remediation                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------- |
| Manager-only endpoint restriction             | `/api/routes*`, `/api/warehouses*`, `/api/onboarding*`, manager assignment endpoints                         | `src/routes/api/routes/+server.ts:52`, `src/routes/api/warehouses/+server.ts:42`, `src/routes/api/onboarding/+server.ts:18`, `src/routes/api/assignments/[id]/assign/+server.ts:15`                | PASS    | High       | Keep shared guard pattern; add helper to reduce drift.                                 |
| Driver-scoped data access                     | `/api/assignments/mine`, `/api/assignments/[id]/confirm`, `/api/assignments/[id]/cancel`, `/api/preferences` | `src/routes/api/assignments/mine/+server.ts:66`, `src/lib/server/services/confirmations.ts:90`, `src/routes/api/assignments/[id]/cancel/+server.ts:59`, `src/routes/api/preferences/+server.ts:76` | PASS    | High       | Continue ownership checks in both read and write paths.                                |
| Confirm window enforcement (7d-48h)           | `/api/assignments/[id]/confirm`                                                                              | `src/lib/server/services/confirmations.ts:47`, `src/lib/server/services/confirmations.ts:105`, `src/lib/server/services/confirmations.ts:109`                                                      | PASS    | Medium     | Add boundary integration tests for DST transitions.                                    |
| Cancel late-cancellation detection            | `/api/assignments/[id]/cancel`                                                                               | `src/lib/server/services/assignmentLifecycle.ts:63`, `src/lib/server/services/assignmentLifecycle.ts:92`, `src/routes/api/assignments/[id]/cancel/+server.ts:85`                                   | FAIL    | High       | Recompute boundary using exact shift start timestamp.                                  |
| Preference locked rejection after Sunday      | `/api/preferences`                                                                                           | `src/routes/api/preferences/+server.ts:63`, `src/routes/api/preferences/+server.ts:138`, `src/routes/api/cron/lock-preferences/+server.ts:51`                                                      | FAIL    | High       | Align lock comparison with current lock cycle in Toronto timezone.                     |
| Route management scoped to manager warehouses | `/api/routes`, `/api/routes/[id]`                                                                            | `src/routes/api/routes/+server.ts:71`, `src/routes/api/routes/[id]/+server.ts:100`, `src/routes/api/routes/[id]/+server.ts:160`                                                                    | FAIL    | High       | Enforce access checks on both existing and target warehouses for PATCH/POST semantics. |
| Warehouse cascading on delete                 | `/api/warehouses/[id]` + schema                                                                              | `src/routes/api/warehouses/[id]/+server.ts:247`, `src/lib/server/db/schema.ts:118`, `src/lib/server/db/schema.ts:100`                                                                              | PARTIAL | Medium     | Clarify and codify cascade vs hard-block strategy.                                     |
| Onboarding invite lifecycle                   | `/api/onboarding*` + signup auth hooks                                                                       | `src/routes/api/onboarding/+server.ts:56`, `src/lib/server/auth-abuse-hardening.ts:268`, `src/lib/server/auth-abuse-hardening.ts:323`                                                              | FAIL    | High       | Make authorization consume atomic with signup completion.                              |
| Input validation                              | All audited route groups                                                                                     | `src/routes/api/assignments/[id]/cancel/+server.ts:36`, `src/routes/api/routes/[id]/+server.ts:73`, `src/routes/api/onboarding/+server.ts:35`                                                      | FAIL    | High       | Add JSON parse guards and UUID param schemas consistently.                             |
| Consistent error format                       | All audited route groups                                                                                     | `src/routes/api/routes/+server.ts:53`, `src/routes/api/onboarding/+server.ts:47`, `src/routes/api/cron/lock-preferences/+server.ts:46`                                                             | FAIL    | Medium     | Adopt one shared API error envelope.                                                   |

## Unverified / Follow-up

- No live request replay was run against a staging database, so invalid-UUID and malformed-JSON failure paths are based on static code-path analysis.
- DST boundary behavior (Toronto EST/EDT transitions) for confirmation and late-cancel windows should be validated with integration tests using frozen clocks around transition weekends.
