# DRV-5yo.6 — Track F: Harden Manager Warehouse/Route/Assignment/Reports APIs

Source: `documentation/plans/organization-multi-tenant-one-user-one-org.md` (Section 9.2)

## Objective

Replace manual auth checks with `requireManagerWithOrg(locals)` in all manager
warehouse, route, assignment, bid-window, and reports endpoints. Most endpoints
already use org-scoped helpers (`getManagerWarehouseIds`, `canManagerAccessWarehouse`)
for data access — this task standardizes the auth guard pattern.

## Key Observation

Most endpoints already resolve `organizationId` via
`locals.organizationId ?? locals.user.organizationId ?? ''` and pass it to
org-aware service functions. The primary change is replacing the manual
`if (!locals.user) / if (role !== 'manager')` pattern with `requireManagerWithOrg(locals)`
which does the same checks plus validates org existence.

The `dispatch/+server.ts` endpoint is already migrated — skip it.

## Endpoints (13 total, grouped by file)

### Group 1: Warehouses (3 files)

1. `src/routes/api/warehouses/+server.ts` — GET (list) + POST (create)
2. `src/routes/api/warehouses/[id]/+server.ts` — GET + PATCH + DELETE
3. `src/routes/api/warehouses/[id]/managers/+server.ts` — GET + POST + DELETE

### Group 2: Routes (2 files)

4. `src/routes/api/routes/+server.ts` — GET (list) + POST (create)
5. `src/routes/api/routes/[id]/+server.ts` — PATCH + DELETE

### Group 3: Assignments (3 files)

6. `src/routes/api/assignments/[id]/assign/+server.ts` — POST
7. `src/routes/api/assignments/[id]/override/+server.ts` — POST
8. `src/routes/api/assignments/[id]/emergency-reopen/+server.ts` — POST (proxy)

### Group 4: Bid Windows (3 files)

9. `src/routes/api/bid-windows/+server.ts` — GET
10. `src/routes/api/bid-windows/[id]/assign/+server.ts` — POST
11. `src/routes/api/bid-windows/[id]/close/+server.ts` — POST

### Group 5: Reports (2 files)

12. `src/routes/api/weekly-reports/+server.ts` — GET
13. `src/routes/api/weekly-reports/[weekStart]/+server.ts` — GET

## Implementation Pattern

For each endpoint handler:

1. Replace manual auth block:

   ```typescript
   // BEFORE
   if (!locals.user) throw error(401, 'Unauthorized');
   if (locals.user.role !== 'manager') throw error(403, 'Forbidden');

   // AFTER
   const { user: manager, organizationId } = requireManagerWithOrg(locals);
   ```

2. Replace inline organizationId resolution:

   ```typescript
   // BEFORE
   const organizationId = locals.organizationId ?? locals.user.organizationId ?? '';

   // AFTER (already have it from guard)
   // Remove the inline resolution line
   ```

3. Replace `locals.user.id` with `manager.id` (from destructured guard result)

4. Add `requireManagerWithOrg` import, remove `error` import if no longer used

## Files Not Modified

- `src/routes/api/settings/dispatch/+server.ts` — already uses `requireManagerWithOrg`

## Tests

No existing route-level tests for these endpoints. Track K (DRV-5yo.11) covers test expansion.
Run full test suite to verify no regressions.
