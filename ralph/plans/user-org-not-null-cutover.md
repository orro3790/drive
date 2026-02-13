# User organizationId NOT NULL Cutover Plan

## Objective

Enforce `user.organizationId` as a database-level invariant (`NOT NULL`) while keeping signup flows (create organization and join organization) reliable and reversible during rollout.

## Why this follow-up is needed

Current behavior relies on an after-hook to assign organization membership after the user row is created. That means:

1. DB-level invariant is not guaranteed for `user.organization_id`.
2. Correctness depends on every runtime path using org guards.
3. Partial failures can leave org-less users that require reconciliation.

The target is one user -> one organization as a hard data invariant.

## Scope

In scope:

1. Move org assignment to pre-insert user creation logic.
2. Keep/adjust existing onboarding reservation semantics.
3. Add migration and validation to enforce `user.organization_id NOT NULL`.
4. Add reconciliation and observability for failure paths.
5. Update tests and documentation for new guarantees.
6. Inventory all user-creation entry points and define org assignment behavior for each.

Out of scope:

1. Multi-org memberships.
2. Billing or licensing model changes.
3. Reworking product semantics beyond one user -> one org.

## Current implementation anchors

1. Auth config and additional user fields: `src/lib/server/auth.ts`
2. Signup before/after middleware: `src/lib/server/auth-abuse-hardening.ts`
3. Join/create org finalization services: `src/lib/server/services/organizationSignup.ts`
4. User auth schema: `src/lib/server/db/auth-schema.ts`
5. Existing Track L migration decision: `drizzle/0016_enforce_org_not_null.sql`

## Design approach

Use Better Auth `databaseHooks.user.create.before` to ensure the inserted user row already includes `organizationId` (and role), then keep after-hook logic for finalization side effects only.

### Hook data contract

To avoid duplicate reservation/provision calls, define and enforce one request-scoped contract:

1. First validate that Better Auth context propagation is reliable across `hooks.before -> databaseHooks.user.create.before -> hooks.after`.
2. `hooks.before` validates headers and computes signup intent.
3. `hooks.before` performs join reservation once and stores `{ reservationId, organizationId, targetRole }` in request-scoped context.
4. `databaseHooks.user.create.before` reads that context and only maps resolved values to user insert data.
5. `hooks.after` consumes the same reservation id (join) or finalizes ownership (create).
6. If propagation is not reliable, use fallback path:
   - derive assignment directly inside DB hook from request metadata,
   - and persist a short-lived signup-intent record for after-hook consumption.
7. Any missing contract data is fail-closed with explicit errors and reconciliation logging.

### Key principle

No user insert should occur without a resolved org assignment.

## Implementation plan

### Phase 1 - Pre-insert org assignment in auth database hooks

1. Add `databaseHooks.user.create.before` in `src/lib/server/auth.ts`.
2. Add a user-creation entry-point inventory (email signup, admin paths, scripts/tests, provider flows).
3. In the DB before hook, resolve org assignment from request-scoped signup context (create vs join) for supported paths.
4. Join mode:
   - Reuse reservation result from `hooks.before` (do not reserve again).
   - Return `{ data: { organizationId, role } }` to user create hook.
5. Create mode:
   - Provision organization before user insert (owner may be assigned in finalize step).
   - Preserve current behavior parity: slug/join-code generation policy, conflict retry, and dispatch settings initialization.
   - Return `{ data: { organizationId, role: 'manager' } }`.
6. Non-signup user-create paths must be explicit:
   - either provide deterministic org assignment,
   - or fail closed with explicit error semantics until supported.
7. If org metadata is missing/invalid, fail user creation with explicit API error.

Files touched:

1. `src/lib/server/auth.ts`
2. `src/lib/server/auth-abuse-hardening.ts` (context access helpers)
3. `src/lib/server/services/organizationSignup.ts` (new prepare/provision helpers)

### Phase 2 - Adjust after-hook to finalize side effects, not core org assignment

1. Keep after-hook for confirmation/finalization bookkeeping.
2. Join mode after-hook:
   - Consume the reservation id produced in `hooks.before` and mark onboarding record consumed.
   - Do not depend on after-hook to assign `organizationId` to user.
3. Create mode after-hook:
   - Set `organizations.ownerUserId` and any remaining ownership metadata.
   - Do not depend on after-hook for user org assignment.
4. Keep reconciliation logging on finalize failure paths.
5. Add guardrails against duplicate reservation handling (single reservation consumed per successful signup attempt).

Files touched:

1. `src/lib/server/auth-abuse-hardening.ts`
2. `src/lib/server/services/organizationSignup.ts`

### Phase 3 - Failure compensation and cleanup hardening

Because before-hook work can happen before user insert completes, add explicit cleanup rules:

1. Reservation cleanup:
   - Keep stale reservation release logic for join flow.
2. Create-org cleanup:
   - Add cleanup for stale organizations created during failed signup attempts where ownership was never finalized.
3. Add structured logs/metrics for:
   - before-hook assignment failures
   - finalize failures
   - cleanup actions

Files touched:

1. `src/lib/server/services/organizationSignup.ts`
2. `src/lib/server/logger.ts` (if new event names/constants are needed)
3. Optional script: `scripts/reconcile-signup-org-finalization.ts`

### Phase 4 - Schema and migration enforcement

1. Add migration `drizzle/0017_user_org_not_null.sql`:
   - Run precheck query for null `user.organization_id`.
   - If null users exist, run deterministic remediation/backfill and re-check.
   - Block migration unless null-user count is zero.
   - Drop `user_organization_id_organizations_id_fk` if needed.
   - Set `user.organization_id NOT NULL`
   - Recreate FK with `ON DELETE RESTRICT`
   - Run FK integrity verification query after migration.
2. Update Drizzle schema:
   - `src/lib/server/db/auth-schema.ts` -> `organizationId: uuid('organization_id').notNull()`
3. Keep warehouse and signup_onboarding constraints from Track L unchanged.

### Phase 5 - Validation and tests

Add or update tests for:

1. Signup create path sets organizationId before user persistence.
2. Signup join path sets organizationId before user persistence.
3. Invalid org metadata blocks user creation.
4. Reservation consumed after successful join signup.
5. Only one reservation is created/consumed per successful join signup (no duplicate reserve).
6. Create-signup still initializes org dispatch settings correctly.
7. Hook context propagation contract is proven by test (`hooks.before` to DB hook to `hooks.after`).
8. Finalize failure logs reconciliation signal and does not create cross-org corruption.
9. Non-signup user-creation path behavior is explicitly tested (assigned or fail-closed).
10. Guards still deny users without org in runtime edge cases.

Candidate files:

1. `tests/server/authSignupOnboardingHook.test.ts`
2. `tests/server/authSignupReservationFlow.test.ts`
3. `tests/server/organizationSignupService.test.ts`
4. New: `tests/server/authDatabaseHooksOrgAssignment.test.ts`

Validation commands:

1. `pnpm test`
2. `pnpm exec svelte-check --tsconfig ./tsconfig.json`
3. `pnpm validate`

## Rollout strategy

### Stage A - Code deploy with compatibility

1. Deploy before-hook assignment + adjusted after-hook.
2. Keep DB column nullable for one deploy window.
3. Monitor with explicit checks:
   - Null users query: `SELECT count(*) FROM "user" WHERE organization_id IS NULL`.
   - Signup failure rate and reconciliation event counts.
4. Gate rule: if null-user count increases above baseline at any point, pause rollout and remediate before Stage B.

### Stage B - Enforce DB invariant

1. Run migration validation queries and scripts.
2. If null users are found, run remediation/backfill and repeat validation.
3. Apply `0017_user_org_not_null.sql` only when go/no-go gate is green (null-user count = 0).
4. Verify runtime health and signup success rates.

### Stage C - Cleanup

1. Remove temporary compatibility branches that assumed nullable user org.
2. Update canonical docs to restore strict acceptance language.

## Risks and mitigations

1. Risk: before-hook creates side effects that survive failed signup.
   - Mitigation: stale cleanup + reconciliation job + detailed logs.
2. Risk: hook context missing headers in non-standard signup callers.
   - Mitigation: fail closed with explicit error; add contract tests.
3. Risk: race conditions in reservation handling.
   - Mitigation: keep reservation state machine and transactional updates.

## Acceptance criteria

1. New signup users are inserted with non-null `organizationId`.
2. `user.organization_id` is `NOT NULL` in DB.
3. Join/create signup flows pass existing and new tests.
4. Reconciliation logs are emitted for any failed finalization path.
5. No regression in org guard behavior across APIs.

## Deliverables

1. Updated auth hook implementation (`before` + `after` responsibilities split).
2. Migration file enforcing user org NOT NULL.
3. Backfill/remediation runbook for null users before cutover.
4. Updated schema typing and docs.
5. Expanded tests for pre-insert org assignment and failure handling.
6. Cutover checklist with Stage A metrics and Stage B go/no-go gates.
