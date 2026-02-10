# DRV-17l.8: Close onboarding allowlist TOCTOU and consume atomically

Task: `DRV-17l.8`  
Parent: `DRV-17l`  
Status: Drafted for execution

## 1) Goal and scope

Implement onboarding security/remediation items from:

- `logs/nightly/2026-02-10/audit-services-notifications-onboarding.md`
- `logs/nightly/2026-02-10/audit-api-management.md`

Specifically:

1. Remove production allowlist TOCTOU outcome where signup can succeed even if onboarding consume fails/races.
2. Add DB-enforced uniqueness for pending onboarding entries by `(email, kind)`.
3. Normalize malformed onboarding JSON into explicit `400` contract responses.

Out of scope:

- Broader API error-envelope normalization across all management endpoints.
- Non-onboarding management hardening items tracked in `DRV-17l.13`.

## 2) Findings mapped to code

1. **TOCTOU gap**:
   - Guard authorizes before signup in `createSignupAbuseGuard`.
   - Consume runs in `createSignupOnboardingConsumer` after signup success.
   - Consume `null`/error only logs and does not block/compensate.
2. **Duplicate pending entries under concurrency**:
   - `createOnboardingApproval` and `createOnboardingInvite` both do check-then-insert.
   - Schema has no unique pending `(email, kind)` constraint.
3. **Malformed JSON handling**:
   - `src/routes/api/onboarding/+server.ts` uses raw `await request.json()` with no parse guard.

## 3) Implementation decisions

### A) TOCTOU remediation via pre-signup reservation + post-signup finalize

Use a reservation-first flow so allowlist authorization is consumed before account creation, then finalized after successful signup.

Implementation plan:

1. Add explicit reservation state in onboarding model:
   - extend `signup_onboarding_status` enum with `reserved`,
   - update service/status types to include `reserved`.
2. Add reservation primitives in onboarding service:
   - `reserveProductionSignupAuthorization(...)`: atomically transitions one matching entry from `pending` -> `reserved` and returns reservation metadata.
   - `finalizeProductionSignupAuthorizationReservation(...)`: transitions `reserved` -> `consumed`, sets `consumedByUserId` and `consumedAt` after successful signup.
   - `releaseProductionSignupAuthorizationReservation(...)`: transitions `reserved` -> `pending` if signup fails before user creation.
3. In `createSignupAbuseGuard` (before hook):
   - replace read-only authorize call with reservation call,
   - deny signup when reservation cannot be acquired,
   - attach reservation id to hook context so after hook can finalize/release deterministically.
4. In `createSignupOnboardingConsumer` (after hook):
   - if signup succeeds, finalize reservation with created user id,
   - if signup fails, release reservation,
   - if finalize fails after signup success, log high-severity telemetry and enqueue/trigger reconciliation to backfill `consumedByUserId`; do not treat this as an authorization breach because reservation already consumed pre-signup.
5. Add high-signal logs for reserve/finalize/release/reconciliation failures.
6. Add crash-safe reservation recovery for `reserved` rows only:
   - release stale `reserved` leases (timeout window) during reserve attempts and/or via reconciliation helper,
   - never auto-release `consumed` entries.

Rationale: this narrows the race window at authorization time while keeping finalize failures as reconciliation work, not authorization bypass.

### B) DB-level uniqueness for pending onboarding entries

1. Add partial unique index in schema + migration:
   - unique `(email, kind)` where `status = 'pending'`.
2. Make migration safe on existing data before adding the index:
   - add enum value `reserved` to onboarding status type,
   - mark expired pending entries as revoked,
   - dedupe existing pending rows by `(email, kind)` (keep newest pending, revoke older duplicates).
3. Update onboarding create service methods to be race-safe:
   - keep existing "return already pending entry" semantics,
   - on unique-violation race (`code=23505` + exact new index/constraint name), re-read active pending entry and return `alreadyExists: true` instead of 500,
   - rethrow unrelated DB errors.

### C) Malformed JSON -> explicit 400

1. Wrap `request.json()` in `try/catch` in `src/routes/api/onboarding/+server.ts`.
2. Return stable contract, e.g. `{ error: 'invalid_json' }` with status `400`.
3. Keep schema-validation branch for well-formed but invalid payloads.

## 4) Planned file touch points

- `src/lib/server/auth-abuse-hardening.ts`
- `src/lib/server/services/onboarding.ts`
- `src/lib/server/db/schema.ts`
- `src/routes/api/onboarding/+server.ts`
- `drizzle/0013_*` (new migration)
- `drizzle/meta/*` (generated metadata)
- `tests/server/onboardingService.test.ts`
- `tests/server/authSignupOnboardingHook.test.ts`
- `tests/server/onboardingApi.test.ts` (new)
- `tests/server/authSignupReservationFlow.test.ts` (new, integration-leaning)

## 5) Test and verification plan

Automated:

1. `tests/server/authSignupOnboardingHook.test.ts`
   - verify reservation id is propagated from before hook context,
   - verify finalize path for successful signup and release path for failed signup,
   - verify finalize-failure reconciliation branch when finalize fails after signup success.
2. `tests/server/onboardingService.test.ts`
   - verify reserve/finalize/release semantics (single winner under contention),
   - verify stale reservation recovery does not strand onboarding entries,
   - verify duplicate-pending race resolves to `alreadyExists` contract (no 500),
   - verify only expected unique-violation constraint is downgraded to conflict behavior.
3. `tests/server/onboardingApi.test.ts` (new)
   - malformed JSON returns `400` with `invalid_json`.
4. `tests/server/authSignupReservationFlow.test.ts` (new)
   - verify no persistent usable unauthorized account/session under race/revoke simulation,
   - verify finalize-failure path marks event for reconciliation without allowing unreserved signup.

Validation commands:

```bash
pnpm test -- tests/server/authSignupOnboardingHook.test.ts tests/server/onboardingService.test.ts tests/server/onboardingApi.test.ts
pnpm test -- tests/server/authSignupReservationFlow.test.ts
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm validate
```

## 6) Acceptance criteria mapping

1. **Allowlist race/revoke windows cannot leave unauthorized accounts**
   - Proven by reservation-first consume + finalize/release flow tests.
2. **Pending onboarding duplicates prevented at DB level**
   - Proven by partial unique index + race-safe handling.
3. **Malformed JSON returns controlled 400 contract**
   - Proven by endpoint parse-guard tests.
