# User Creation Contract for Org Assignment Cutover

Source traceability:

- `ralph/plans/user-org-not-null-cutover.md` (Scope item 6, Hook data contract, Phase 1 items 2 and 6)

## Entry Point Inventory

| Entry point                    | Runtime path                                                   | Assignment source before insert                                                                                                                        | Role rule                                              | Fail-closed rule                                                                                    |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Email signup (create org mode) | `POST /api/auth/sign-up/email` with `x-signup-org-mode=create` | `databaseHooks.user.create.before` provisions organization via `prepareOrganizationCreateSignup`, writes `organizationId` into user insert payload     | Forced `manager`                                       | Reject if org metadata is missing/invalid, org provisioning fails, or assignment context is missing |
| Email signup (join org mode)   | `POST /api/auth/sign-up/email` with `x-signup-org-mode=join`   | `hooks.before` reserves onboarding once and stores `{ reservationId, organizationId, targetRole }`; DB hook maps that context into user insert payload | Uses reserved `targetRole` (`driver`/`manager`)        | Reject if reservation or assignment context is missing/malformed                                    |
| Admin create user              | `POST /api/auth/admin/create-user` (Better Auth admin plugin)  | DB hook accepts only explicit `organizationId` in create payload (`data.organizationId`)                                                               | Explicit role if provided; defaults `user` -> `driver` | Reject when `organizationId` is missing/invalid                                                     |
| Seed script user creation      | `scripts/seed.ts` direct DB insert                             | Script sets `organizationId` to generated `seedOrgId` on every inserted user row                                                                       | Uses generated fixture role (`driver`/`manager`)       | Script does not create users without `organizationId`                                               |
| Social/provider signup         | Not configured in `src/lib/server/auth.ts`                     | N/A                                                                                                                                                    | N/A                                                    | Path is unsupported until a deterministic organization assignment rule is implemented               |

## Hook Context Propagation Proof

Propagation contract: `hooks.before -> databaseHooks.user.create.before -> hooks.after`

Evidence:

1. Contract test coverage:
   - `tests/server/authDatabaseHooksOrgAssignment.test.ts` validates join/create assignment flow and shared context propagation across before -> DB hook -> after.
2. Better Auth runtime plumbing (framework-level proof):
   - `node_modules/.pnpm/better-auth@1.4.18_@sveltej_b43ead738cf16bb1341e52a47fb7b583/node_modules/better-auth/dist/api/to-auth-endpoints.mjs` merges before-hook context into endpoint context and carries it into endpoint execution.
   - `node_modules/.pnpm/better-auth@1.4.18_@sveltej_b43ead738cf16bb1341e52a47fb7b583/node_modules/better-auth/dist/db/with-hooks.mjs` fetches current endpoint context and passes it as the second argument to database hooks.
   - `node_modules/.pnpm/better-auth@1.4.18_@sveltej_b43ead738cf16bb1341e52a47fb7b583/node_modules/better-auth/dist/api/to-auth-endpoints.mjs` runs after-hooks using the same endpoint context object.

## Explicit Fail-Closed Semantics

- Signup org headers missing/invalid: `BAD_REQUEST` with `Invalid organization signup details`.
- Signup assignment contract missing in DB hook: `BAD_REQUEST` with `Missing signup organization assignment`.
- Non-signup user create without explicit org assignment: `BAD_REQUEST` with `User creation requires explicit organization assignment`.
- Admin create user without `data.organizationId`: same fail-closed policy with path-specific hint.
