# DRV-5yo.5 — Track E: Harden High-Risk Manager Endpoints

Source: `documentation/plans/organization-multi-tenant-one-user-one-org.md` (Section 9.1)

## Objective

Add org-boundary enforcement to the five high-risk manager endpoints so that
managers can only view/mutate drivers and users within their own organization.

## Endpoints in Scope

| #   | Endpoint                              | File                                                        | Current Auth      | Fix                                                               |
| --- | ------------------------------------- | ----------------------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| 1   | `GET /api/drivers`                    | `src/routes/api/drivers/+server.ts`                         | Manual role check | `requireManagerWithOrg` + filter drivers by `user.organizationId` |
| 2   | `PATCH /api/drivers/[id]`             | `src/routes/api/drivers/[id]/+server.ts`                    | Manual role check | `requireManagerWithOrg` + `assertSameOrgUser` before mutation     |
| 3   | `GET /api/drivers/[id]/shifts`        | `src/routes/api/drivers/[id]/shifts/+server.ts`             | Manual role check | `requireManagerWithOrg` + `assertSameOrgUser` before query        |
| 4   | `GET /api/drivers/[id]/health`        | `src/routes/api/drivers/[id]/health/+server.ts`             | Manual role check | `requireManagerWithOrg` + `assertSameOrgUser` before query        |
| 5   | `POST (manager)/admin/reset-password` | `src/routes/(manager)/admin/reset-password/+page.server.ts` | Manual role check | `requireManagerWithOrg` + org filter on user lookup               |

## Implementation Steps

### Step 1: `GET /api/drivers` — org-scoped driver list

Replace manual auth check with `requireManagerWithOrg(locals)`.
Add `eq(user.organizationId, organizationId)` to the drivers query WHERE clause (currently only filters by `role='driver'`).
The `completedAssignmentCounts` query also needs org scoping — add `eq(warehouses.organizationId, organizationId)` to the WHERE clause so cohort averages only include same-org warehouses.

Changes:

- Import `requireManagerWithOrg` from `$lib/server/org-scope`
- Replace lines 64-71 (manual auth check) with `const { organizationId } = requireManagerWithOrg(locals);`
- Change `.where(eq(user.role, 'driver'))` → `.where(and(eq(user.role, 'driver'), eq(user.organizationId, organizationId)))`
- Add `eq(warehouses.organizationId, organizationId)` to the `completedAssignmentCounts` WHERE clause

### Step 2: `PATCH /api/drivers/[id]` — org-bounded driver update

Replace manual auth check with `requireManagerWithOrg(locals)`.
After extracting `organizationId`, call `assertSameOrgUser(organizationId, id)` before any mutation. This verifies the target driver is in the same org. If not, throws 403.

The existing "Verify target user exists and is a driver" SELECT is still needed for the role check and to get current state for audit logging, but we add the org assertion before it.

Changes:

- Import `requireManagerWithOrg`, `assertSameOrgUser` from `$lib/server/org-scope`
- Replace lines 22-28 with `const { organizationId } = requireManagerWithOrg(locals);`
- Add `await assertSameOrgUser(organizationId, id);` before the existing user SELECT

### Step 3: `GET /api/drivers/[id]/shifts` — org-bounded shift history

Replace manual auth check with `requireManagerWithOrg(locals)`.
Call `assertSameOrgUser(organizationId, id)` before querying. This replaces the manual target user SELECT + role check (assertSameOrgUser already verifies the user exists in the org). However, we still need the role check and the driver name for the response, so keep the existing SELECT but add `eq(user.organizationId, organizationId)` to its WHERE clause.

Changes:

- Import `requireManagerWithOrg` from `$lib/server/org-scope`
- Replace lines 15-22 with `const { organizationId } = requireManagerWithOrg(locals);`
- Add `eq(user.organizationId, organizationId)` to the target user SELECT WHERE clause

### Step 4: `GET /api/drivers/[id]/health` — org-bounded health view

Same pattern as shifts: replace manual auth, add org filter to target user SELECT.

Changes:

- Import `requireManagerWithOrg` from `$lib/server/org-scope`
- Replace lines 19-26 with `const { organizationId } = requireManagerWithOrg(locals);`
- Add `eq(user.organizationId, organizationId)` to the target user SELECT WHERE clause

### Step 5: `POST /admin/reset-password` — org-bounded password reset

Replace manual role check with `requireManagerWithOrg(locals)`.
Add org filter to the user lookup by email: `and(eq(authSchema.user.email, email), eq(authSchema.user.organizationId, organizationId))`.

This prevents Manager A from resetting the password of a user in Org B. The error returned is 404 (user not found) rather than 403 to avoid cross-tenant enumeration.

Changes:

- Import `requireManagerWithOrg` from `$lib/server/org-scope`
- Replace lines 32-34 with `const { organizationId } = requireManagerWithOrg(locals);`
- Update the user email lookup to filter by org: `and(eq(authSchema.user.email, email), eq(authSchema.user.organizationId, organizationId))`

### Step 6: Update/create tests

No existing route-level tests for these 5 endpoints (Track K will add full cross-org regression tests). However, existing tests that mock these endpoints or import from them need to be checked for compatibility. The `driverHealthApi.test.ts` tests the driver-facing `/api/driver-health` endpoint, not the manager-facing `/api/drivers/[id]/health`, so no changes needed there.

If any existing tests break due to the new auth pattern, update the mocked `locals` to include `organizationId`.

### Step 7: Run full test suite

`pnpm test` — ensure all existing tests still pass.

## Security Model

- Cross-org access returns 404 (for lookups) or 403 (for assertSameOrgUser), preventing enumeration
- Org context comes from authenticated session, never from client payload
- `assertSameOrgUser` does a single DB query checking both user existence and org membership
- `requireManagerWithOrg` combines auth + role + org checks in one call

## Files Modified

- `src/routes/api/drivers/+server.ts`
- `src/routes/api/drivers/[id]/+server.ts`
- `src/routes/api/drivers/[id]/shifts/+server.ts`
- `src/routes/api/drivers/[id]/health/+server.ts`
- `src/routes/(manager)/admin/reset-password/+page.server.ts`

## Not in Scope

- Adding new test files for these endpoints (deferred to Track K: DRV-5yo.11)
- Audit log org scoping (separate track)
- Service layer org scoping (Track H)
