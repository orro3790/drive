# Organization Multi-Tenant Rollout Plan (One User -> One Organization)

Status: proposed (approved for implementation)

Last updated: 2026-02-12

Owner request: support licensing to multiple companies with strict organization boundaries, using one owner account per organization and invite/approval onboarding for managers and drivers.

## 1) Objective

Implement organization-scoped multi-tenancy across auth, onboarding, API access control, services, realtime, and cron so that:

1. Data and actions are isolated per organization.
2. Every user belongs to exactly one organization.
3. Existing pilot data can be migrated safely without service disruption.

## 2) Locked Product Decisions

1. Exactly one user belongs to exactly one organization (no multi-org membership in v1).
2. Role model remains `driver` / `manager`; organization owner is represented by `organizations.ownerUserId` and is a manager.
3. Organization onboarding is approval-driven (existing whitelist model), now org-scoped.
4. Organization join requires an organization code and an org-scoped onboarding approval.
5. No repo split and no per-customer deployment forks.

## 3) Non-Goals (V1)

1. Multi-organization users.
2. Complex organization hierarchies (enterprise parent/child orgs).
3. Billing/subscription system changes.
4. External IdP tenant federation.

## 4) Current State Risks (Why this is urgent)

The current implementation is mostly single-tenant and has several cross-tenant risk points:

1. No org field on auth user table (`src/lib/server/db/auth-schema.ts`).
2. Onboarding/whitelist entries are global (`src/lib/server/services/onboarding.ts`, `src/routes/api/onboarding/+server.ts`).
3. Driver manager APIs can access platform-wide users (`src/routes/api/drivers/+server.ts`, `src/routes/api/drivers/[id]/+server.ts`).
4. Manager SSE is globally broadcast to all connected managers (`src/lib/server/realtime/managerSse.ts`).
5. Scheduling and bidding currently source from global driver pool (`src/lib/server/services/scheduling.ts`, `src/lib/server/services/bidding.ts`).
6. Dispatch settings are global singleton (`src/lib/server/services/dispatchSettings.ts`).

## 5) Target Architecture

### 5.1 Core tenant boundary

1. `user.organizationId` is the canonical tenant claim for a user.
2. `warehouses.organizationId` is the root domain ownership anchor.
3. Routes, assignments, bids, shifts, reports, notifications, etc., are tenant-scoped through explicit joins to warehouse-owned data or direct user organization checks.

### 5.2 Authorization principle

1. Never trust org id from client payload.
2. Resolve tenant from authenticated user/session (`locals.organizationId`).
3. Every manager operation must pass role + same-org authorization.
4. Every driver operation must ensure the assignment/route/resource belongs to driver's org.

## 6) Data Model and Migration Plan

### 6.1 Schema changes (additive phase)

Update `src/lib/server/db/schema.ts`:

1. Add `organizations` table:
   - `id uuid primary key defaultRandom()`
   - `name text not null`
   - `slug text not null`
   - `joinCodeHash text not null`
   - `ownerUserId text references user.id onDelete set null`
   - `createdAt timestamptz not null default now`
   - `updatedAt timestamptz not null default now`
2. Add `organizationId uuid nullable references organizations.id` to `warehouses`.
3. Add `organizationId uuid nullable references organizations.id` to `signup_onboarding`.
4. Add `targetRole text not null default 'driver'` to `signup_onboarding`.
5. Add `organizationId uuid nullable references organizations.id` to `notifications` (for safe fanout queries).
6. Add `organizationId uuid nullable references organizations.id` to `audit_logs` (for traceability/forensics).
7. Introduce org-scoped dispatch settings table:
   - `organization_dispatch_settings`
   - `organizationId uuid primary key references organizations.id onDelete cascade`
   - `emergencyBonusPercent integer not null default 20`
   - `updatedBy text references user.id onDelete set null`
   - `updatedAt timestamptz not null default now`

Update `src/lib/server/db/auth-schema.ts`:

1. Add `organizationId uuid nullable references organizations.id` to `user`.

### 6.2 Indexes and constraints

Add indexes and uniques:

1. `idx_user_org` on `user.organization_id`.
2. `idx_warehouses_org` on `warehouses.organization_id`.
3. `idx_signup_onboarding_org_email_status` on `signup_onboarding(organization_id,email,status)`.
4. `uq_organizations_slug` unique on `slug` (stored normalized lowercase).
5. `uq_organizations_join_code_hash` unique on `join_code_hash`.
6. Partial unique for pending onboarding per org/email/kind/targetRole:
   - unique index on `(organization_id,email,kind,target_role)` where `status='pending'`.

### 6.3 Backfill strategy

Migration sequence:

1. Create one default organization (`Drive Default Org`) and generated join code.
2. Backfill all existing users to this org.
3. Backfill all existing warehouses to this org.
4. Backfill all existing onboarding entries to this org.
5. Backfill notifications/audit logs to this org where derivable; for legacy rows fallback to default org.
6. Backfill org dispatch settings row from current global dispatch setting.

Validation gates before enforcement:

1. No users with null `organizationId`.
2. No warehouses with null `organizationId`.
3. No onboarding rows with null `organizationId`.
4. No orphan references to missing organizations.

### 6.4 Enforcement phase (later)

After all code paths are migrated and validated:

1. Set `warehouses.organizationId` to NOT NULL. ✓ (Track L)
2. Set `signup_onboarding.organizationId` to NOT NULL. ✓ (Track L)
3. **Keep `user.organizationId` NULLABLE** — Better Auth signup flow creates user with null org, then the after-hook sets it. Application-layer guards (`org-scope.ts`) enforce non-null at runtime.
4. Remove legacy global dispatch settings reads/writes.

## 7) Auth and Session Context

### 7.1 Better Auth config

Update `src/lib/server/auth.ts`:

1. Include `organizationId` in `user.additionalFields` with `input: false`.
2. Ensure signup finalization updates role + `organizationId` together.

### 7.2 Request context

Update `src/hooks.server.ts` and `src/app.d.ts`:

1. Add `locals.organizationId`.
2. Populate from authenticated session user.
3. For authenticated non-public routes, fail closed if user exists but org is missing after enforcement cutover.

### 7.3 Shared org guard helpers

New module: `src/lib/server/org-scope.ts`.

Add helper APIs:

1. `requireAuthenticatedWithOrg(locals)`.
2. `requireManagerWithOrg(locals)`.
3. `requireDriverWithOrg(locals)`.
4. `assertSameOrgUser(managerOrgId, targetUserId)`.
5. `assertWarehouseInOrg(warehouseId, orgId)`.

All manager endpoints migrate to these helpers to avoid ad-hoc checks.

## 8) Signup and Onboarding Redesign

### 8.1 UX flow

Update `src/routes/(auth)/sign-up/+page.svelte`:

1. Add mode toggle:
   - `Create Organization`
   - `Join Organization`
2. Create mode fields:
   - `organizationName`
3. Join mode fields:
   - `organizationCode`

### 8.2 API/auth hook contract

Auth signup request must carry org metadata (custom headers):

1. `x-signup-org-mode: create|join`
2. `x-signup-org-name: <name>` (create mode)
3. `x-signup-org-code: <code>` (join mode)

If Better Auth client wrapper cannot send these directly, implement thin server-side signup proxy endpoint and call auth API there.

### 8.3 Create-org flow (owner)

In `src/lib/server/auth-abuse-hardening.ts` + onboarding service:

1. Validate org name/slug candidate.
2. On successful auth signup, transactionally:
   - create organization,
   - assign `ownerUserId = user.id`,
   - set `user.organizationId`,
   - set `user.role = 'manager'`.
3. If post-signup finalization fails, emit reconciliation log event and alert.

### 8.4 Join-org flow (manager/driver)

1. Resolve org by join code hash.
2. Find org-scoped pending onboarding approval for email with target role.
3. Reserve onboarding entry before account creation.
4. On successful signup, consume reservation and set:
   - `user.organizationId = onboarding.organizationId`
   - `user.role = onboarding.targetRole`
5. On failure, release reservation.

### 8.5 Onboarding service changes

Update `src/lib/server/services/onboarding.ts` and `src/lib/schemas/onboarding.ts`:

1. Add `organizationId` to all core service APIs and queries.
2. Add `targetRole` support (`driver` or `manager`).
3. List/create/revoke/restore strictly within manager's org.
4. Prevent manager in org A from seeing or changing org B onboarding rows.

### 8.6 Onboarding API changes

Update endpoints:

1. `src/routes/api/onboarding/+server.ts`
2. `src/routes/api/onboarding/[id]/revoke/+server.ts`
3. `src/routes/api/onboarding/[id]/restore/+server.ts`

Rules:

1. Caller must be manager with org.
2. Mutations must verify row belongs to caller org.
3. API request schema supports selecting `targetRole`.

## 9) Endpoint Hardening Matrix

### 9.1 High-risk manager endpoints (phase-first)

1. `src/routes/api/drivers/+server.ts`:
   - only list drivers where `user.organizationId = caller.organizationId`.
2. `src/routes/api/drivers/[id]/+server.ts`:
   - verify target driver in same org before patching caps/flags/reinstatement.
3. `src/routes/api/drivers/[id]/shifts/+server.ts`:
   - verify target driver in same org and assignments joined to same org warehouses.
4. `src/routes/api/drivers/[id]/health/+server.ts`:
   - verify target driver in same org.
5. `src/routes/(manager)/admin/reset-password/+page.server.ts`:
   - target user lookup must enforce same org.

### 9.2 Manager warehouse/route/assignment endpoints

Update all manager endpoints to use org-aware warehouse checks via `canManagerAccessWarehouse` plus org verification:

1. `src/routes/api/warehouses/+server.ts`
2. `src/routes/api/warehouses/[id]/+server.ts`
3. `src/routes/api/warehouses/[id]/managers/+server.ts`
4. `src/routes/api/routes/+server.ts`
5. `src/routes/api/routes/[id]/+server.ts`
6. `src/routes/api/assignments/[id]/assign/+server.ts`
7. `src/routes/api/assignments/[id]/override/+server.ts`
8. `src/routes/api/assignments/[id]/emergency-reopen/+server.ts`
9. `src/routes/api/bid-windows/+server.ts`
10. `src/routes/api/bid-windows/[id]/assign/+server.ts`
11. `src/routes/api/bid-windows/[id]/close/+server.ts`
12. `src/routes/api/weekly-reports/+server.ts`
13. `src/routes/api/weekly-reports/[weekStart]/+server.ts`
14. `src/routes/api/settings/dispatch/+server.ts`

### 9.3 Driver endpoints

Verify every resource touched belongs to driver's organization:

1. `src/routes/api/dashboard/+server.ts`
2. `src/routes/api/assignments/mine/+server.ts`
3. `src/routes/api/assignments/[id]/confirm/+server.ts`
4. `src/routes/api/assignments/[id]/cancel/+server.ts`
5. `src/routes/api/preferences/+server.ts`
6. `src/routes/api/preferences/routes/+server.ts`
7. `src/routes/api/bids/+server.ts`
8. `src/routes/api/bids/available/+server.ts`
9. `src/routes/api/bids/mine/+server.ts`
10. `src/routes/api/metrics/+server.ts`
11. `src/routes/api/driver-health/+server.ts`
12. `src/routes/api/shifts/arrive/+server.ts`
13. `src/routes/api/shifts/start/+server.ts`
14. `src/routes/api/shifts/complete/+server.ts`
15. `src/routes/api/shifts/[assignmentId]/edit/+server.ts`

## 10) Service Layer Refactor Plan

### 10.1 Manager access helpers

Update `src/lib/server/services/managers.ts`:

1. `getManagerWarehouseIds(userId, organizationId)`.
2. `canManagerAccessWarehouse(userId, warehouseId, organizationId)`.
3. `getRouteManager(routeId, organizationId)`.

### 10.2 Scheduling and bidding

Update:

1. `src/lib/server/services/scheduling.ts`
2. `src/lib/server/services/bidding.ts`
3. `src/lib/server/services/assignments.ts`

Changes:

1. Driver pools are org-scoped.
2. Assignment queries must remain within org-owned warehouse graph.
3. Expired bid resolution by manager views must only process org windows when org context exists.

### 10.3 Notifications and health systems

Update:

1. `src/lib/server/services/notifications.ts`
2. `src/lib/server/services/metrics.ts`
3. `src/lib/server/services/flagging.ts`
4. `src/lib/server/services/health.ts`
5. `src/lib/server/services/noshow.ts`

Changes:

1. Fanout and aggregates stay org-local.
2. Manager alerts target managers in same org only.
3. Any global scans are replaced with org-iterated scans.

### 10.4 Dispatch settings service

Update `src/lib/server/services/dispatchSettings.ts`:

1. `getDispatchSettings(orgId)`.
2. `updateDispatchSettings(orgId, ...)`.
3. `getEmergencyBonusPercent(orgId)`.

## 11) Realtime Isolation

Update `src/lib/server/realtime/managerSse.ts`:

1. Replace global client set with `Map<organizationId, Set<controller>>`.
2. All broadcast APIs require `organizationId` parameter.

Update `src/routes/api/sse/manager/+server.ts`:

1. Attach stream to caller's org bucket.
2. Reject manager session with missing org.

Update all broadcast call sites in bidding/confirmations/flagging flows to pass org id.

## 12) Cron Isolation

Update all cron handlers under `src/routes/api/cron/**/+server.ts`:

1. Iterate organizations and execute org-scoped work per org.
2. Include `orgId` in log context for every emitted log record.
3. Ensure dedupe keys include org dimension where applicable.

Priority cron files:

1. `lock-preferences`
2. `performance-check`
3. `close-bid-windows`
4. `auto-drop-unconfirmed`
5. `no-show-detection`
6. `shift-reminders`
7. `send-confirmation-reminders`
8. `health-daily`
9. `health-weekly`

## 13) Rollout and Feature Flags

Use staged rollout flags (env-controlled):

1. `ORG_WRITE_ENABLED` - dual-write org fields.
2. `ORG_READ_ENFORCED` - require org filters on reads.
3. `ORG_GUARD_STRICT` - fail closed for missing org context.

Rollout phases:

1. Add schema + backfill + keep permissive reads.
2. Enable org writes.
3. Harden high-risk auth/onboarding + driver/manager APIs.
4. Harden services + SSE + cron.
5. Enable strict guards.
6. Enforce DB NOT NULL and final constraints.

## 14) Testing Plan

### 14.1 Unit/service tests

1. Org guard helpers (`org-scope`).
2. Onboarding reservation and consume/release by org.
3. Scheduling/bidding driver pool isolation.
4. Notification fanout isolation.

### 14.2 Auth hook tests

1. Create-org signup success/failure reconciliation.
2. Join-org signup with pending approval.
3. Join-org denied when org mismatch or missing approval.

### 14.3 API integration tests

1. Cross-org manager access denied for all manager endpoints.
2. Cross-org driver access denied for assignment/shift/bid endpoints.
3. Reset-password denies cross-org target user.

### 14.4 Realtime and cron tests

1. SSE event only received by same-org managers.
2. Cron processing loops org-by-org with no cross-org side effects.

### 14.5 Migration validation tests

1. Backfill script idempotency.
2. Constraint enforcement readiness checks.

## 15) Implementation Tracks (for issue conversion)

Track A: schema, migration, backfill, validation gates.

Track B: auth/session org context and guard helper module.

Track C: signup UI and auth hook create/join org flows.

Track D: onboarding service + API org scoping and `targetRole` support.

Track E: manager high-risk endpoint hardening (`drivers*`, reset-password).

Track F: manager warehouse/route/assignment/bid-window/report endpoint hardening.

Track G: driver endpoint hardening.

Track H: service-layer org scoping (`managers`, `scheduling`, `bidding`, `notifications`, `metrics`, `flagging`, `health`, `noshow`, `dispatchSettings`).

Track I: realtime org bucketization.

Track J: cron org iteration refactor.

Track K: test suite expansion and regression pass.

Track L: rollout flags, strict enforcement, and NOT NULL migration.

## 16) Acceptance Criteria (definition of done)

1. Every authenticated user has non-null `organizationId`.
2. All manager and driver endpoints enforce same-org data boundaries.
3. No manager can view/mutate users/resources outside their org.
4. No driver can read/write assignments/resources outside their org.
5. SSE broadcasts are org-isolated.
6. Cron jobs process org-scoped data without cross-org side effects.
7. Onboarding approvals/invites are org-scoped and role-targeted.
8. Dispatch settings are org-scoped, not global singleton.
9. Test coverage includes cross-org denial and same-org success paths.
10. DB constraints are enforced (NOT NULL + uniques) after cutover.

## 17) Developer Execution Notes

1. Implement in track order unless dependencies explicitly allow parallel work.
2. Do not skip migration validation gates before enabling strict guards.
3. Do not trust client-supplied org identifiers.
4. Every PR for this initiative must reference this file:
   - `documentation/plans/organization-multi-tenant-one-user-one-org.md`

## 18) Source of Truth

This file is the canonical roadmap for the organization multi-tenant initiative.

Path: `documentation/plans/organization-multi-tenant-one-user-one-org.md`
