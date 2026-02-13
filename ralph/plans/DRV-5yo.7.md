# DRV-5yo.7: Track G — Harden Driver Endpoints for Org Boundaries

## Goal

Replace manual auth blocks with `requireDriverWithOrg` (or `requireAuthenticatedWithOrg` for multi-role endpoints) across all driver-facing API endpoints. Eliminate inline `organizationId` fallback pattern.

## Pattern

```typescript
// Before
if (!locals.user) throw error(401, 'Unauthorized');
if (locals.user.role !== 'driver') throw error(403, 'Forbidden');
const organizationId = locals.organizationId ?? locals.user.organizationId ?? '';

// After
const { user, organizationId } = requireDriverWithOrg(locals);
```

## Files to Modify

### Already Migrated (skip)

- `src/routes/api/shifts/start/+server.ts` — uses `requireDriverWithOrg`
- `src/routes/api/users/me/+server.ts` — uses `requireAuthenticatedWithOrg`

### Driver-Only Endpoints (use `requireDriverWithOrg`)

1. `src/routes/api/dashboard/+server.ts` — GET
2. `src/routes/api/driver-health/+server.ts` — GET
3. `src/routes/api/notifications/+server.ts` — GET
4. `src/routes/api/notifications/[id]/read/+server.ts` — PATCH
5. `src/routes/api/notifications/mark-all-read/+server.ts` — POST
6. `src/routes/api/assignments/[id]/confirm/+server.ts` — POST
7. `src/routes/api/assignments/[id]/cancel/+server.ts` — POST
8. `src/routes/api/assignments/mine/+server.ts` — GET
9. `src/routes/api/shifts/arrive/+server.ts` — POST
10. `src/routes/api/shifts/complete/+server.ts` — POST
11. `src/routes/api/shifts/[assignmentId]/edit/+server.ts` — PATCH
12. `src/routes/api/preferences/+server.ts` — GET, PUT
13. `src/routes/api/preferences/routes/+server.ts` — GET
14. `src/routes/api/metrics/+server.ts` — GET
15. `src/routes/api/bids/+server.ts` — POST
16. `src/routes/api/bids/mine/+server.ts` — GET
17. `src/routes/api/bids/available/+server.ts` — GET

### Multi-Role Endpoints (use `requireAuthenticatedWithOrg`)

18. `src/routes/api/users/fcm-token/+server.ts` — POST, DELETE

## Scope Notes

- Do NOT add `organizationId` filters to DB queries that already filter by `userId`. The user's org membership is validated by the guard; userId-scoped queries are inherently org-scoped.
- DO replace inline `organizationId` fallback patterns with the guard's destructured value.
- DO replace `locals.user.id` with `user.id` from the guard destructure.
