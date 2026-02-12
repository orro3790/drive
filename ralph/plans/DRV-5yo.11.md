# DRV-5yo.11: Test Expansion and Cross-Org Regression Coverage

## Goal

Add targeted tests that prove organization isolation works across auth hooks, API endpoints, services, realtime SSE, and cron jobs. Focus on **cross-org deny** cases — verifying that user A in org-a cannot access org-b resources.

## Non-Goals

- Do NOT add tests for endpoints that already have thorough org-scope coverage (shifts/arrive, shifts/start, shifts/complete, shifts/edit, assignments/cancel, assignments/confirm, dispatch settings, onboarding, onboarding revoke, assignment override, emergency reopen, users/me, users/password, users/fcm-token)
- Do NOT add migration/schema constraint tests (deferred to DRV-5yo.12 NOT NULL enforcement)
- Do NOT refactor existing tests

## Existing Coverage Summary

**Already covered (skip):**

- `orgScope.test.ts` — guard unit tests (all 5 functions)
- `managerSse.test.ts` — cross-org SSE isolation
- `noShowOrgScopeService.test.ts` — no-show org scoping
- `managersService.test.ts` — manager warehouse/route access
- `notificationsService.test.ts` — cross-org notification blocking
- All 15 endpoint tests listed above already test 401/403/role checks

## Implementation Steps

### Step 1: Auth hook org context population test

**File:** `tests/server/hooksOrgContext.test.ts`

Test the critical hook code path (hooks.server.ts:109-115) that populates `locals.organizationId` from session:

1. **Session with organizationId** → `locals.organizationId` is set to the string value
2. **Session without organizationId** → `locals.organizationId` is undefined
3. **Session with non-string organizationId** → `locals.organizationId` is undefined
4. **No session** → `locals.user` and `locals.organizationId` are not set

Pattern: Same mocking approach as `hooksObservability.test.ts` — mock `auth.api.getSession`, `svelteKitHandler`, etc. Use a non-API protected route so we hit the full `handle()` path and can inspect `event.locals` afterward via the `resolve` spy.

### Step 2: Cron multi-org iteration tests

**File:** `tests/server/cronOrgIteration.test.ts`

Test that cron endpoints iterate over ALL organizations (not just one). Pick one representative cron to test thoroughly — `no-show-detection` already has org tests, so test a different one.

Use `cronHealthDailyApi.test.ts` as the pattern reference. Add a focused test:

1. **Multi-org fan-out**: Mock `organizations` table to return `[{id:'org-a'}, {id:'org-b'}]`. Verify the service function is called once per org with the correct `organizationId`.
2. **Empty org list**: Mock empty organizations table → service not called, returns success with zero totals.
3. **Per-org error isolation**: org-a succeeds, org-b throws → response includes partial results with error count, org-a work is preserved.

Pick `auto-drop-unconfirmed` cron for this test since it's a simpler service boundary.

Read the actual cron handler to confirm the iteration pattern before implementing.

### Step 3: Driver API org-scope guard tests (batch file)

**File:** `tests/server/driverApiOrgScope.test.ts`

Lightweight test that proves the org-scope guard fires correctly on driver endpoints that currently have NO test file. These endpoints filter by `userId` so cross-org data leakage is already prevented by ownership — the guard adds defense-in-depth.

Test each endpoint with 3 cases:

1. **No user** → 401
2. **User with no organizationId** → 403 (guard rejects)
3. **Wrong role (manager)** → 403 (driver guard rejects)

**Endpoints to cover:**

- `GET /api/dashboard`
- `GET /api/assignments/mine`
- `POST /api/bids` (bid creation)
- `GET /api/bids/mine`
- `GET /api/bids/available`
- `GET /api/preferences` (GET handler)
- `PUT /api/preferences` (PUT handler)
- `GET /api/preferences/routes`
- `GET /api/metrics`
- `GET /api/notifications` (uses `requireAuthenticatedWithOrg`, not role-specific)
- `PATCH /api/notifications/[id]/read` (uses `requireAuthenticatedWithOrg`)
- `POST /api/notifications/mark-all-read` (uses `requireAuthenticatedWithOrg`)

For each endpoint, dynamically import the module with mocked dependencies (db, services, logger). The test only needs to reach the guard — mock everything else as no-ops.

**Key pattern**: Use `vi.doMock` for `$lib/server/db` and any other imports the module needs, then `await import(...)` the route module. Call the handler with `createRequestEvent({ locals: {...} })`. Assert the thrown HttpError status.

**Note:** Notification endpoints use `requireAuthenticatedWithOrg` (no role check), so their "wrong role" test should instead verify that a driver WITH org can pass the guard (positive case, since both roles are allowed).

### Step 4: Manager API org-scope guard tests (batch file)

**File:** `tests/server/managerApiOrgScope.test.ts`

Same pattern as Step 3 but for manager endpoints that currently lack tests.

Test each endpoint with 3 cases:

1. **No user** → 401
2. **User with no organizationId** → 403
3. **Wrong role (driver)** → 403

**Endpoints to cover:**

- `GET /api/drivers`
- `GET /api/drivers/[id]`
- `GET /api/drivers/[id]/shifts`
- `GET /api/drivers/[id]/health`
- `GET /api/routes`
- `POST /api/routes`
- `GET /api/routes/[id]`
- `PATCH /api/routes/[id]`
- `DELETE /api/routes/[id]`
- `GET /api/warehouses`
- `POST /api/warehouses`
- `GET /api/warehouses/[id]`
- `PATCH /api/warehouses/[id]`
- `DELETE /api/warehouses/[id]`
- `GET /api/warehouses/[id]/managers`
- `POST /api/bid-windows`
- `POST /api/bid-windows/[id]/assign`
- `POST /api/bid-windows/[id]/close`
- `POST /api/assignments/[id]/assign`
- `GET /api/weekly-reports`
- `GET /api/weekly-reports/[weekStart]`

Each sub-describe block should dynamically import the specific route module with minimal mocking (only enough to satisfy module-level imports). The guard fires before any DB queries, so mock DB as a no-op.

### Step 5: SSE endpoint org-scope guard test

**File:** Extend `tests/server/managerSse.test.ts` (or create `tests/server/managerSseApi.test.ts`)

The SSE module (`managerSse.ts`) already has cross-org isolation tests. But the API endpoint (`/api/sse/manager/+server.ts`) that wraps it needs guard testing:

1. **No user** → 401
2. **Non-manager** → 403
3. **Manager without org** → 403
4. **Manager with org** → passes guard (stream created with correct orgId)

Read the SSE endpoint file first to confirm the guard pattern.

### Step 6: Service-layer org parameter forwarding tests

**File:** `tests/server/serviceOrgForwarding.test.ts`

For services that accept `organizationId` as a parameter, verify the parameter is used in the query/logic (not ignored). Focus on services not already tested for org-scoping:

1. **`updateDriverMetrics(userId, organizationId)`** — verify organizationId is passed through to the DB query
2. **`checkDriverForFlagging(userId, organizationId)`** — verify organizationId flows to flagging logic
3. **`sendNotification` / `sendBulkNotifications`** — verify organizationId is used in FCM token lookup

Read each service file to understand how organizationId is used before writing assertions.

## Test File Count

6 new test files (Steps 1-6). Estimated ~40-60 test cases total.

## Commit Strategy

One commit per step. Each commit should pass `pnpm test` independently.
