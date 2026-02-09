# Test Coverage and Quality Audit

Task: DRV-a5s
Scope: `tests/` (all files)
Date: 2026-02-10

## Scope Verification

- `expected_test_files=37`
- `audited_test_files=37`
- `*.test.ts` files audited: 34
- harness/support files audited: 3 (`tests/harness/requestEvent.ts`, `tests/harness/serviceMocks.ts`, `tests/harness/time.ts`)
- API routes discovered: 46 (`src/routes/api/**/+server.ts`)
- API routes with direct route-module tests: 16
- API routes without direct route-module tests: 30

## Severity Rubric

- `critical`: security or dispatch-integrity regressions likely to reach production without strong detection.
- `high`: important business logic paths under-tested enough that realistic regressions are likely.
- `medium`: meaningful confidence/maintainability gaps that reduce defect detection quality.
- `low`: minor quality or determinism gaps with limited immediate impact.

## Critical-Path Coverage (Happy + Error)

| Area                                                          | Evidence                                                                                                                                                                                                                                                                                             | Coverage assessment                                                                          | Gaps                                                                                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shift lifecycle (`arrive/start/complete/edit/cancel/confirm`) | `tests/server/shiftsArriveApi.test.ts`, `tests/server/shiftsStartApi.test.ts`, `tests/server/shiftsCompleteApi.test.ts`, `tests/server/shiftsEditApi.test.ts`, `tests/server/assignmentsCancelApi.test.ts`, `tests/server/assignmentsConfirmApi.test.ts`, `tests/server/assignmentLifecycle.test.ts` | Strong happy-path + error-path API boundary coverage for core driver actions.                | No direct tests for `assign`/`emergency-reopen` endpoints; no DST boundary tests for lifecycle transitions.                                                               |
| Bidding pipeline                                              | `tests/server/biddingService.test.ts`, `tests/server/cronCloseBidWindowsApi.test.ts`                                                                                                                                                                                                                 | Partial. Creation, duplicate-window handling, instant-assign conflict/success paths covered. | No direct implementation tests for competitive `resolveBidWindow` behavior, tie ordering, or race safety. Bid endpoints (`/api/bids*`, `/api/bid-windows*`) are untested. |
| Confirmations                                                 | `tests/server/confirmationsService.test.ts`, `tests/server/assignmentsConfirmApi.test.ts`, `tests/server/cronAutoDropUnconfirmedApi.test.ts`, `tests/server/cronSendConfirmationRemindersApi.test.ts`                                                                                                | Good boundary validation for confirmation window and error mapping.                          | Limited coverage of service internals for already-confirmed/forbidden edge branches; no end-to-end confirmation + reminder integration flow.                              |
| Health scoring and presentation                               | `tests/server/healthPolicyService.test.ts`, `tests/server/driverHealthApi.test.ts`, `tests/server/cronHealthDailyApi.test.ts`, `tests/server/cronHealthWeeklyApi.test.ts`, `tests/utils/healthCardState.test.ts`                                                                                     | Good policy-level branch checks and API response shaping.                                    | Daily/weekly cron tests are wrapper-level only (mocked service); no integration/idempotency tests on health cron job behavior.                                            |

## Services/Endpoints With No Tests

### Service modules with no direct implementation tests

- `src/lib/server/services/audit.ts`
- `src/lib/server/services/flagging.ts`
- `src/lib/server/services/managers.ts`
- `src/lib/server/services/metrics.ts`
- `src/lib/server/services/notifications.ts`

### API route modules with no direct route-module tests

- `src/routes/api/assignments/[id]/assign/+server.ts`
- `src/routes/api/assignments/[id]/emergency-reopen/+server.ts`
- `src/routes/api/assignments/mine/+server.ts`
- `src/routes/api/bid-windows/+server.ts`
- `src/routes/api/bid-windows/[id]/assign/+server.ts`
- `src/routes/api/bid-windows/[id]/close/+server.ts`
- `src/routes/api/bids/+server.ts`
- `src/routes/api/bids/available/+server.ts`
- `src/routes/api/bids/mine/+server.ts`
- `src/routes/api/dashboard/+server.ts`
- `src/routes/api/drivers/+server.ts`
- `src/routes/api/drivers/[id]/+server.ts`
- `src/routes/api/drivers/[id]/health/+server.ts`
- `src/routes/api/metrics/+server.ts`
- `src/routes/api/notifications/+server.ts`
- `src/routes/api/notifications/[id]/read/+server.ts`
- `src/routes/api/notifications/mark-all-read/+server.ts`
- `src/routes/api/onboarding/+server.ts`
- `src/routes/api/onboarding/[id]/revoke/+server.ts`
- `src/routes/api/preferences/+server.ts`
- `src/routes/api/preferences/routes/+server.ts`
- `src/routes/api/routes/+server.ts`
- `src/routes/api/routes/[id]/+server.ts`
- `src/routes/api/sse/manager/+server.ts`
- `src/routes/api/users/fcm-token/+server.ts`
- `src/routes/api/users/me/+server.ts`
- `src/routes/api/users/password/+server.ts`
- `src/routes/api/warehouses/+server.ts`
- `src/routes/api/warehouses/[id]/+server.ts`
- `src/routes/api/warehouses/[id]/managers/+server.ts`

## Test Quality Findings

| Finding                                                                                                                           | Evidence                                                                                                                                | Severity | Required action                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security-critical surface has no direct route tests (`/api/users/*`, onboarding revoke, manager CRUD endpoints).                  | Untested route list above.                                                                                                              | critical | Add route-module tests for auth/user credential/token endpoints and onboarding revoke before production cut.                                                  |
| Bidding correctness relies on partially covered service paths; competitive resolver behavior is not directly tested.              | `tests/server/biddingService.test.ts` covers create/instant paths only; `tests/server/cronCloseBidWindowsApi.test.ts` mocks resolver.   | critical | Add direct tests for `resolveBidWindow` competitive ranking, tie-breaks, transitions, and concurrent invocation safety.                                       |
| Notifications/metrics/flagging/managers/audit services are not tested directly; current route tests mostly mock these boundaries. | Service coverage list; multiple `vi.doMock('$lib/server/services/...')` patterns in route tests.                                        | high     | Add focused service-level tests for side-effect correctness, failure handling, and payload contracts.                                                         |
| Scheduling coverage is thin relative to service complexity and policy importance.                                                 | `tests/server/schedulingService.test.ts` has 4 boundary tests only.                                                                     | high     | Add tests for weekly schedule generation, preference locking edge windows, Toronto timezone/DST boundaries, and flagged-driver selection under mixed cohorts. |
| Cron idempotency is not comprehensively tested across cron endpoints.                                                             | Cron suites generally execute a single run; only targeted idempotent behavior appears in `tests/server/noShowDetectionService.test.ts`. | high     | Add run-twice assertions for all cron handlers to confirm no duplicate side effects.                                                                          |
| Test suites are heavily implementation-coupled around mocked query chains (`select().from().where()` scaffolds).                  | Most server route tests mock `drizzle-orm` operators and DB chain internals.                                                            | medium   | Add behavior-first integration tests (or thin DB-backed contract tests) that validate outcomes without reproducing query internals.                           |
| Some boundary tests only assert status codes without asserting structured error payload content consistency.                      | Example patterns in `tests/server/assignmentsConfirmApi.test.ts`, cron wrapper tests.                                                   | medium   | Add error-body shape assertions for all public API error paths.                                                                                               |
| Timezone coverage exists but does not include DST transition boundaries.                                                          | Timezone checks in `assignmentLifecycle`, `schedulingService`, `noShowDetectionService`; no DST-specific cases.                         | medium   | Add DST forward/backward boundary tests for confirmation/no-show/arrival windows.                                                                             |
| Flaky risk is moderate-low but present where async timing relies on wait loops.                                                   | `tests/stores/routeStore.test.ts`, `tests/stores/warehouseStore.test.ts` use deferred promises + `vi.waitFor`.                          | low      | Keep deterministic deferred control and avoid real timer dependence in future store tests.                                                                    |

## Auth Abuse Scenario Coverage

- Covered well at policy/hook level: `tests/server/authAbuseHardening.test.ts`, `tests/server/authSignupOnboardingHook.test.ts`, and onboarding race handling in `tests/server/onboardingService.test.ts`.
- Missing at endpoint level: no direct tests for password reset/forgot-password flows, account-enumeration behavior, or real rate-limit enforcement around auth endpoints.

## Missing Assertions and Flaky Risk Summary

- No assertion-free `it(...)` blocks were observed in audited `*.test.ts` files.
- Main assertion gap is depth (status-only checks in some boundary tests), not complete absence.
- Most time-sensitive suites correctly use `freezeTime/resetTime`; primary residual flake risk remains async wait-loop sequencing in store tests.

## Acceptance-Criteria Traceability

| Acceptance criterion                                                                            | Evidence                                                        | Finding                                                                                           | Severity | Required action                                                    |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| Identify services/endpoints with no tests                                                       | Service and API no-test lists above                             | Clear inventory produced; 30/46 API routes untested, 5 core services untested directly            | critical | Prioritize security and dispatch-critical endpoints/services first |
| Evaluate critical-path coverage (happy + error)                                                 | Critical-path matrix section                                    | Shift lifecycle strong; bidding/health/scheduling have meaningful gaps                            | high     | Expand bidding resolver and scheduling/health cron coverage        |
| Assess test quality + harness mock correctness                                                  | Quality findings; harness files reviewed (`tests/harness/*.ts`) | Harness utilities are useful, but over-mocking creates implementation coupling                    | medium   | Add behavior-first integration contracts and payload assertions    |
| Identify edge-case gaps (boundary/timezone/concurrency), cron idempotency, auth abuse scenarios | Edge findings + auth section                                    | Boundary checks exist; DST + comprehensive idempotency + endpoint auth abuse coverage are missing | high     | Add DST, repeat-run cron, and auth endpoint abuse tests            |
| Flag missing assertions and flaky-test risks                                                    | Missing assertions/flaky section                                | No assertion-free tests; some status-only checks and wait-loop timing risks                       | medium   | Add error-body assertions and keep deterministic async control     |
| Deliver severity-rated prioritized list                                                         | Must-add list below                                             | Completed                                                                                         | n/a      | n/a                                                                |

## Prioritized Must-Add-Tests-Before-Production

1. **[critical] Security/user endpoint contracts**
   - Add direct tests for `src/routes/api/users/me/+server.ts`, `src/routes/api/users/password/+server.ts`, `src/routes/api/users/fcm-token/+server.ts`, and onboarding revoke flow.
2. **[critical] Bidding resolver correctness under competition and concurrency**
   - Add service tests for `resolveBidWindow` ranking, tie-break determinism, transition flow (`competitive -> instant -> emergency/close`), and concurrent resolver calls.
3. **[high] Notification side-effect reliability**
   - Add direct tests for `src/lib/server/services/notifications.ts` including token invalidation, bulk batching, and partial provider failures.
4. **[high] Scheduling generation and policy windows**
   - Expand `scheduling` service tests to include `generateWeekSchedule`, preference lock timing, and Toronto DST cutovers.
5. **[high] Cron idempotency across all handlers**
   - Add run-twice tests for each `src/routes/api/cron/*/+server.ts` handler, asserting no duplicate state transitions/notifications.
6. **[high] Manager assignment and reopening endpoints**
   - Add direct route tests for `assign` and `emergency-reopen` endpoints with both authorization and lifecycle edge conditions.
7. **[medium] Metrics/flagging/managers/audit service correctness**
   - Add direct service tests for side-effect chains now only exercised through mocks.
8. **[medium] API error contract consistency**
   - Add payload-shape assertions for error paths (not only status code assertions).
9. **[medium] Password reset abuse/enum protections**
   - Add endpoint-level tests for forgot/reset flows and account-enumeration hardening.
10. **[low] Store test determinism hardening**
    - Keep deferred promise control explicit and avoid timeouts or implicit scheduler assumptions.

## Audited File Inventory (37/37)

- `tests/harness/requestEvent.ts`
- `tests/harness/requestEventHarness.test.ts`
- `tests/harness/serviceMocks.ts`
- `tests/harness/testingHarness.test.ts`
- `tests/harness/time.ts`
- `tests/seed/deterministicSeed.test.ts`
- `tests/server/assignmentLifecycle.test.ts`
- `tests/server/assignmentsCancelApi.test.ts`
- `tests/server/assignmentsConfirmApi.test.ts`
- `tests/server/assignmentsService.test.ts`
- `tests/server/authAbuseHardening.test.ts`
- `tests/server/authSignupOnboardingHook.test.ts`
- `tests/server/biddingService.test.ts`
- `tests/server/confirmationsService.test.ts`
- `tests/server/cronAutoDropUnconfirmedApi.test.ts`
- `tests/server/cronCloseBidWindowsApi.test.ts`
- `tests/server/cronHealthDailyApi.test.ts`
- `tests/server/cronHealthWeeklyApi.test.ts`
- `tests/server/cronLockPreferencesApi.test.ts`
- `tests/server/cronPerformanceCheckApi.test.ts`
- `tests/server/cronSendConfirmationRemindersApi.test.ts`
- `tests/server/cronShiftRemindersApi.test.ts`
- `tests/server/driverHealthApi.test.ts`
- `tests/server/healthPolicyService.test.ts`
- `tests/server/noShowDetectionCronApi.test.ts`
- `tests/server/noShowDetectionService.test.ts`
- `tests/server/onboardingService.test.ts`
- `tests/server/schedulingService.test.ts`
- `tests/server/shiftsArriveApi.test.ts`
- `tests/server/shiftsCompleteApi.test.ts`
- `tests/server/shiftsEditApi.test.ts`
- `tests/server/shiftsStartApi.test.ts`
- `tests/stores/routeStore.test.ts`
- `tests/stores/warehouseStore.test.ts`
- `tests/utils/driverLifecycleIa.test.ts`
- `tests/utils/errorDisplay.test.ts`
- `tests/utils/healthCardState.test.ts`
