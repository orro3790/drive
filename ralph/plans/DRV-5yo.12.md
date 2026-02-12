# Track L: Rollout Flags, Strict Guard Cutover, and NOT NULL Enforcement

Task: DRV-5yo.12

## Context

All org-scoping tracks (A-K) have been merged. Guards already reject null org (403). The phased rollout was accomplished through track-by-track merges, so explicit rollout flags (`ORG_WRITE_ENABLED`, `ORG_READ_ENFORCED`, `ORG_GUARD_STRICT`) are unnecessary — the guards are already strict.

What remains:

1. Backfill existing data so no rows have null `organizationId` on critical tables
2. Validate zero-null state before enforcing NOT NULL
3. Apply NOT NULL migration on critical tables (`user`, `warehouses`, `signup_onboarding`) + FK onDelete updates
4. Update Drizzle schema to reflect `.notNull()` on those columns
5. Update seed script to create an organization and assign it to all seeded entities
6. Fix test fixtures that pass undefined/null org (TypeScript inference changes)

### Tables and NOT NULL strategy

| Table             | organizationId nullable? | Enforce NOT NULL?       | Rationale                                                                                          |
| ----------------- | ------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------- |
| user              | yes                      | **no** (stays nullable) | Better Auth signup creates user with null org, then after-hook sets it. Guards enforce at runtime. |
| warehouses        | yes                      | **yes**                 | Root domain anchor                                                                                 |
| signup_onboarding | yes                      | **yes**                 | Org-scoped approvals                                                                               |
| notifications     | yes                      | no                      | Historical; some pre-org notifications legitimately have no org                                    |
| audit_logs        | yes                      | no                      | Historical/diagnostic; not all audit events have org context                                       |

### FK onDelete concern

Current FK constraints use `onDelete: 'set null'`. After NOT NULL enforcement, SET NULL would cause a constraint violation on org deletion. Must update to `onDelete: 'restrict'` — orgs should never be deleted while they have users/warehouses/onboarding entries.

## Steps

### Step 1: Create backfill script (`scripts/backfill-organizations.ts`)

Idempotent script that:

1. Checks if a "Drive Default Org" exists (by slug `drive-default-org`); if not, creates one
2. Backfills `user.organizationId` where null → set to default org
3. Backfills `warehouses.organizationId` where null → set to default org
4. Backfills `signup_onboarding.organizationId` where null → set to default org
5. Backfills `notifications.organizationId` where null → derive via JOIN to `user.organizationId` (best-effort, leave null for orphaned/system notifications)
6. Backfills `audit_logs.organizationId` where null → derive via JOIN to `user.organizationId` on `actorId` (best-effort, leave null for system actors or deleted users)
7. Prints summary of rows updated per table

### Step 2: Create validation script (`scripts/validate-org-migration.ts`)

Script that checks:

1. Zero users with null `organizationId`
2. Zero warehouses with null `organizationId`
3. Zero signup_onboarding with null `organizationId`
4. All referenced organizations actually exist (FK integrity)
5. Prints pass/fail summary; exits non-zero if any check fails

**IMPORTANT**: Validation MUST pass before running the NOT NULL migration. The migration is effectively irreversible without data loss.

### Step 3: Create NOT NULL migration (`drizzle/0016_enforce_org_not_null.sql`)

SQL migration:

```sql
-- Drop existing SET NULL FK constraints
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_organization_id_organizations_id_fk";
ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_organization_id_organizations_id_fk";
ALTER TABLE "signup_onboarding" DROP CONSTRAINT IF EXISTS "signup_onboarding_organization_id_organizations_id_fk";

-- Enforce NOT NULL
ALTER TABLE "user" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "warehouses" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "signup_onboarding" ALTER COLUMN "organization_id" SET NOT NULL;

-- Re-add FK constraints with ON DELETE RESTRICT
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "signup_onboarding" ADD CONSTRAINT "signup_onboarding_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
```

### Step 4: Update Drizzle schema to `.notNull()` + FK onDelete

In `src/lib/server/db/auth-schema.ts`:

- Change `organizationId: uuid('organization_id')` → `organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' })`
- Note: auth-schema.ts currently has no FK reference — the FK is defined via relations in schema.ts. Need to add the import and inline reference.

In `src/lib/server/db/schema.ts`:

- `warehouses.organizationId` → `.references(() => organizations.id)` → `.notNull().references(() => organizations.id, { onDelete: 'restrict' })`
- `signupOnboarding.organizationId` → same pattern

### Step 5: Update seed script to create organization

Modify `scripts/seed.ts`:

1. Import `organizations` and `organizationDispatchSettings` from schema
2. In `clearData()`, delete `organizationDispatchSettings` then `organizations` (after deleting entities that reference them)
3. At the start of `seed()`, create a "Seed Test Org" with slug `seed-test-org` and a hashed join code
4. When inserting users, include `organizationId: seedOrgId` for all drivers and managers
5. When inserting warehouses, include `organizationId: seedOrgId`
6. When inserting notifications, include `organizationId: seedOrgId` (all seeded notifications belong to the seed org)
7. Also update the test user lookup to set their `organizationId` if null

### Step 6: Fix test fixtures for TypeScript inference changes

The `.notNull()` change means Drizzle's `InferInsertModel` for `user`, `warehouses`, and `signupOnboarding` will require `organizationId: string` (no longer optional). Test files that create these records without `organizationId` will get TypeScript errors. Need to:

1. Scan test files for user/warehouse/onboarding inserts missing `organizationId`
2. Add organizationId to all test fixture creation calls
3. Tests already have org fixtures from Track K — just ensure all insert paths include it

### Step 7: Run tests

Run the full test suite (`pnpm test`) to ensure:

- TypeScript compiles with no errors
- All existing tests pass with the `.notNull()` schema changes
- No regressions in org-scope behavior

## Acceptance Criteria

- Strict org enforcement is active and database constraints are finalized without service disruption
- `user.organizationId`, `warehouses.organizationId`, and `signup_onboarding.organizationId` are NOT NULL in database
- FK constraints use `onDelete: restrict` (not `set null`)
- Drizzle schema matches database constraints (`.notNull()` on all three columns)
- Backfill script is idempotent and safe to run multiple times
- Validation script confirms zero-null state
- Seed script creates org and assigns all entities to it
- All existing tests pass
