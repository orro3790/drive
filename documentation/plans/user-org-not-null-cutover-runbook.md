# User Org NOT NULL Cutover Runbook

Source traceability:

- `ralph/plans/user-org-not-null-cutover.md` (Phase 4 + Stage A/B rollout gates)
- Migration: `drizzle/0017_user_org_not_null.sql`

## Stage A Monitoring Gate (Compatibility Window)

Run these checks continuously after deploying pre-insert assignment hooks:

```sql
SELECT count(*) AS null_user_count FROM "user" WHERE organization_id IS NULL;
```

Go/no-go rule:

- If `null_user_count` rises above baseline at any point, pause rollout and remediate before Stage B.

## Stage B Preflight Checklist

1. Confirm assignment/finalization code is live in production.
2. Confirm null baseline is stable at `0`.
3. Confirm reconciliation monitor is clear (no unresolved finalize failures).
4. Confirm recent signup smoke checks pass for both create and join flows.

## Remediation Loop (Required if null users exist)

1. Inspect null users:

```sql
SELECT id, email, created_at
FROM "user"
WHERE organization_id IS NULL
ORDER BY created_at DESC
LIMIT 200;
```

2. Apply deterministic remediation policy (org assignment per incident runbook).
3. Re-run null count query.
4. Repeat until null count is `0`.

## Apply Migration

Run migration once null-user remediation is complete:

```bash
pnpm drizzle-kit migrate
```

`0017_user_org_not_null.sql` will self-block if null users remain.

## Post-Migration Verification

1. Confirm column constraint:

```sql
SELECT is_nullable
FROM information_schema.columns
WHERE table_name = 'user' AND column_name = 'organization_id';
```

Expected: `NO`.

2. Confirm FK behavior:

```sql
SELECT conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'user' AND conname = 'user_organization_id_organizations_id_fk';
```

Expected: FK exists with `ON DELETE RESTRICT`.

## Abort / Rollback Guidance

- If migration blocks on null users, do not force-forward. Remediate first, then re-run.
- If post-migration smoke tests fail, pause rollout and investigate signup assignment/finalization events before additional deploys.
- Do not drop NOT NULL without incident-level review; treat this as a data-integrity regression.
