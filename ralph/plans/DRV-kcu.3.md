# DRV-kcu.3: API contract tests for driver lifecycle and cron endpoints

Task: `DRV-kcu.3`
Parent: `DRV-kcu`
Status: Drafted for execution

## 1) Goal

Add deterministic API contract coverage for untested driver lifecycle and cron endpoints, with explicit assertions for:

- auth/authorization gates
- validation and status-code mapping
- success payload contracts
- failure/partial-failure behavior for cron loops

No production route behavior changes are planned in this bead.

## 2) Scope

### In scope (10 endpoints)

Driver lifecycle:

1. `POST /api/assignments/[id]/cancel`
2. `POST /api/shifts/arrive`
3. `POST /api/shifts/start`
4. `POST /api/shifts/complete`
5. `PATCH /api/shifts/[assignmentId]/edit`

Cron:

6. `GET /api/cron/shift-reminders`
7. `GET /api/cron/performance-check`
8. `GET /api/cron/lock-preferences`
9. `GET /api/cron/health-daily`
10. `GET /api/cron/health-weekly`

### Existing coverage kept as-is

Already covered and not duplicated:

- `tests/server/assignmentsConfirmApi.test.ts`
- `tests/server/cronAutoDropUnconfirmedApi.test.ts`
- `tests/server/cronSendConfirmationRemindersApi.test.ts`
- `tests/server/cronCloseBidWindowsApi.test.ts`
- `tests/server/noShowDetectionCronApi.test.ts`

## 3) New test suites and exact case matrix

### A. `tests/server/assignmentsCancelApi.test.ts`

Cases:

1. returns `401` when no user is present
2. returns `403` for non-driver role
3. returns `400` for invalid body (`reason` missing/invalid enum)
4. returns `404` when assignment is not found
5. returns `403` when assignment is owned by another driver
6. returns `409` when assignment is already cancelled
7. returns `400` when lifecycle says assignment is not cancelable
8. returns `200` with `{ assignment: { id, status: 'cancelled' } }` and triggers bid window with `trigger: 'cancellation'`

### B. `tests/server/shiftsArriveApi.test.ts`

Cases:

1. `401` unauthenticated
2. `403` non-driver
3. `400` invalid payload (`assignmentId` not UUID)
4. `404` assignment missing
5. `403` assignment ownership mismatch
6. `409` not-arrivable lifecycle state
7. `409` existing shift already present
8. `200` with `{ success: true, arrivedAt: ISO }`

### C. `tests/server/shiftsStartApi.test.ts`

Cases:

1. `401` unauthenticated
2. `403` non-driver
3. `400` invalid payload (`assignmentId` invalid, `parcelsStart` out of range)
4. `404` assignment missing
5. `403` ownership mismatch
6. `409` assignment status not active
7. `404` shift missing
8. `409` lifecycle not startable
9. `409` parcel inventory already recorded
10. `200` with `{ shift: { id, parcelsStart, startedAt }, assignmentStatus: 'active' }`

### D. `tests/server/shiftsCompleteApi.test.ts`

Cases:

1. `401` unauthenticated
2. `403` non-driver
3. `400` invalid payload (`assignmentId` invalid or `parcelsReturned` invalid)
4. `404` assignment missing
5. `409` assignment has no assigned driver
6. `403` ownership mismatch
7. `409` assignment not active
8. `404` shift missing
9. `409` lifecycle not completable
10. `409` shift already completed
11. `409` parcels not recorded
12. `400` `parcelsReturned > parcelsStart`
13. `200` with `{ shift: ..., assignmentStatus: 'completed' }`

### E. `tests/server/shiftsEditApi.test.ts`

Cases:

1. `401` unauthenticated
2. `403` non-driver
3. `400` invalid schema body
4. `400` no editable fields provided
5. `404` assignment missing
6. `403` ownership mismatch
7. `404` shift missing
8. `400` shift not completed yet
9. `400` edit window expired
10. `400` missing parcel data
11. `400` returns exceed start
12. `200` with `{ success: true, shift }`

### F. `tests/server/cronShiftRemindersApi.test.ts`

Cases:

1. `401` missing token
2. `401` wrong token
3. `200` success returns `{ success, sentCount, errorCount, elapsedMs }` and excludes assignments with started shifts
4. `200` continues after notification failure (`errorCount` increments)
5. `500` when candidate lookup fails

### G. `tests/server/cronPerformanceCheckApi.test.ts`

Cases:

1. `401` unauthorized
2. `200` zero-driver run returns zeroed `summary`
3. `200` mixed Promise outcomes update counters (`driversChecked`, `newlyFlagged`, `capsReduced`, `rewardsGranted`, `errors`)
4. `500` when top-level driver query fails

### H. `tests/server/cronLockPreferencesApi.test.ts`

Cases:

1. `401` unauthorized
2. `200` success returns `{ success, lockedCount, schedule, notifiedCount }`
3. dedupe behavior: already-notified users excluded from recipients
4. no recipients path: `sendBulkNotifications` not called, `notifiedCount = 0`
5. `500` when schedule generation fails

### I. `tests/server/cronHealthDailyApi.test.ts`

Cases:

1. `401` unauthorized
2. `200` service passthrough `{ success: true, summary }`
3. `500` when service throws

### J. `tests/server/cronHealthWeeklyApi.test.ts`

Cases:

1. `401` unauthorized
2. `200` service passthrough `{ success: true, summary }`
3. `500` when service throws

## 4) Test architecture and deterministic strategy

- Follow existing harness pattern used in current API suites:
  - `createRequestEvent` from `tests/harness/requestEvent.ts`
  - `createBoundaryMock` from `tests/harness/serviceMocks.ts`
  - `freezeTime` / `resetTime` from `tests/harness/time.ts`
- Module setup pattern per file:
  1. `vi.resetModules()`
  2. `vi.doMock(...)` dependencies (env, db, services, logger)
  3. import route handler after mocks
- For thrown SvelteKit errors (`error(...)`), use:
  - `await expect(HANDLER(event)).rejects.toMatchObject({ status: <code> })`
- For cron JSON responses, assert:
  - exact status + key payload fields
  - `elapsedMs` type (`number`) instead of exact value
- Time-sensitive cron routes (`shift-reminders`, `lock-preferences`) use frozen clock to avoid timezone/date flakiness.

## 5) Execution order

1. Implement driver lifecycle suites first (`assignmentsCancel`, `shiftsArrive`, `shiftsStart`, `shiftsComplete`, `shiftsEdit`).
2. Implement cron suites next (`cronShiftReminders`, `cronPerformanceCheck`, `cronLockPreferences`, `cronHealthDaily`, `cronHealthWeekly`).
3. Run targeted suite batch.
4. Run full `pnpm test`.
5. Run full `pnpm validate`.
6. If failures occur, fix test assumptions only (do not change production behavior unless contract bug is proven).

## 6) Validation commands

```bash
pnpm exec vitest run tests/server/assignmentsCancelApi.test.ts tests/server/shiftsArriveApi.test.ts tests/server/shiftsStartApi.test.ts tests/server/shiftsCompleteApi.test.ts tests/server/shiftsEditApi.test.ts tests/server/cronShiftRemindersApi.test.ts tests/server/cronPerformanceCheckApi.test.ts tests/server/cronLockPreferencesApi.test.ts tests/server/cronHealthDailyApi.test.ts tests/server/cronHealthWeeklyApi.test.ts
pnpm test
pnpm validate
```

## 7) Definition of done

- 10 new API contract test files added under `tests/server/`.
- All new suites pass in targeted run.
- `pnpm test` passes.
- `pnpm validate` passes.
- Coverage includes auth, validation/status mapping, success payload, and failure-path behavior for all 10 scoped endpoints.
