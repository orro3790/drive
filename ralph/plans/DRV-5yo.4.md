# Track D: Onboarding Service and API Org Scoping

Task: DRV-5yo.4

## Context

The signup_onboarding table already has `organizationId` and `targetRole` columns (added in Track A).
The org-scope helpers (`requireManagerWithOrg`, etc.) exist from Track B.
API endpoints already call `requireManagerWithOrg(locals)` but discard the `organizationId`.
Service functions operate globally — no org filters on any queries.

The unique constraint has been renamed from `uq_signup_onboarding_pending_email_kind` to `uq_signup_onboarding_pending_org_email_kind_role` (includes org + targetRole now). The `organizationSignup.ts` service already uses the correct name.

## Steps

### 1. Update onboarding service types and mapper

File: `src/lib/server/services/onboarding.ts`

**a) Add `organizationId` to entry types:**

- `SignupOnboardingEntryRecord`: add `organizationId: string | null`
- `SignupOnboardingEntry`: add `organizationId: string | null`
- Update `toOnboardingEntry` mapper to include `organizationId`

**b) Update the unique constraint constant:**

- Change `PENDING_EMAIL_KIND_UNIQUE_CONSTRAINT` from `'uq_signup_onboarding_pending_email_kind'` to `'uq_signup_onboarding_pending_org_email_kind_role'`

### 2. Update internal helpers to accept optional organizationId

When `organizationId` is provided, add `AND organizationId = $orgId` to the WHERE clause. When not provided (signup flow), query remains global by email.

- `getPendingEntriesByEmailAndKind(email, kind, dbClient, organizationId?)` — add org filter when present
- `getReservedEntriesByEmailAndKind(email, kind, dbClient, organizationId?)` — add org filter when present
- `revokeExpiredPendingEntriesByKind(email, kind, now, dbClient, organizationId?)` — add org filter when present

### 3. Update manager-facing service functions

**a) `listSignupOnboardingEntries(organizationId, limit?, dbClient?)`:**

- Add `organizationId: string` as first required parameter
- Add `WHERE organizationId = $orgId` filter to the query

**b) `createOnboardingApproval(input, dbClient?)`:**

- Add `organizationId: string` to `CreateOnboardingApprovalInput`
- Pass `organizationId` into the INSERT values
- Pass `organizationId` through to internal helper calls

**c) `createOnboardingInvite(input, dbClient?)`:**

- Add `organizationId: string` to `CreateOnboardingInviteInput`
- Pass `organizationId` into the INSERT values
- Pass `organizationId` through to internal helper calls

**d) `revokeOnboardingEntry(entryId, organizationId, revokedByUserId, dbClient?)`:**

- Add `organizationId: string` as second parameter
- Add `eq(signupOnboarding.organizationId, organizationId)` to the WHERE clause

**e) `restoreOnboardingEntry(entryId, organizationId, dbClient?)`:**

- Add `organizationId: string` as second parameter
- Add org filter to both the existence check SELECT and the UPDATE WHERE

### 4. Leave signup-reservation functions unchanged

`reserveProductionSignupAuthorization`, `finalizeProductionSignupAuthorizationReservation`, `releaseProductionSignupAuthorizationReservation` stay global by email — during signup the user has no org yet. Org is determined from the matched entry.

### 5. Update API endpoints to pass organizationId

**a) `GET /api/onboarding`** (`src/routes/api/onboarding/+server.ts`):

- Destructure `organizationId` from `requireManagerWithOrg(locals)`
- Pass `organizationId` to `listSignupOnboardingEntries(organizationId)`

**b) `POST /api/onboarding`** (same file):

- Destructure `organizationId` from `requireManagerWithOrg(locals)`
- Pass `organizationId` in the `createOnboardingApproval` input

**c) `PATCH /api/onboarding/[id]/revoke`**:

- Destructure `{ user, organizationId }` from `requireManagerWithOrg(locals)`
- Pass `organizationId` to `revokeOnboardingEntry(id, organizationId, user.id)`

**d) `PATCH /api/onboarding/[id]/restore`**:

- Destructure `{ organizationId }` from `requireManagerWithOrg(locals)`
- Pass `organizationId` to `restoreOnboardingEntry(id, organizationId)`

### 6. Update existing tests

**a) `tests/server/onboardingApi.test.ts`:**

- Add mock for `listSignupOnboardingEntries` and `createOnboardingApproval`
- Verify service is called with `organizationId` from locals

**b) `tests/server/onboardingRevokeApi.test.ts`:**

- Mock `revokeOnboardingEntry` now expects 3 args: `(entryId, organizationId, revokedByUserId)`
- Update `toHaveBeenCalledWith` assertions

**c) `tests/server/onboardingService.test.ts`:**

- `createOnboardingApproval` calls now need `organizationId` in input
- `createOnboardingInvite` calls now need `organizationId` in input
- `revokeOnboardingEntry` calls now need `organizationId` parameter

### 7. Run tests to verify

- `pnpm test` — all existing tests pass with updated signatures

## Acceptance Criteria

- Managers can only list or mutate onboarding rows in their org and onboarding approvals are role-targeted.
