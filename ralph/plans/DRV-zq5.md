# Database schema migration

Task: DRV-zq5

## Steps

1. Review specs in `documentation/specs/data-model.md` and `documentation/specs/SPEC.md`, confirm target DB/env (Neon) and whether the DB is empty or needs backfills/defaults.
2. Implement all required enums and tables in `src/lib/server/db/schema.ts` with correct types, constraints, defaults, and indexes per spec.
3. Add relations for users, routes, warehouses, and assignments in `src/lib/server/db/schema.ts`.
4. Run `drizzle-kit generate`, inspect the migration SQL for correctness and outline a rollback path if the push fails or data constraints need backfills.
5. Verify the correct `DATABASE_URL` target, run `drizzle-kit push`, and fix any schema or TypeScript errors.

## Acceptance Criteria

- All enums created and exported
- All tables created with correct column types, constraints, defaults
- All relations defined for query builder support
- drizzle-kit generate produces clean migration
- drizzle-kit push succeeds against Neon database
- No TypeScript errors in schema file
