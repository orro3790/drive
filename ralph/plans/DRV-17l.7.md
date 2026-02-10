# DRV-17l.7: Fix Better Auth password and reset hardening gaps

Task: `DRV-17l.7`  
Parent: `DRV-17l`  
Status: Drafted for execution

## 1) Goal and scope

Implement the auth hardening fixes from `logs/nightly/2026-02-10/audit-api-auth-security.md` by:

1. Replacing custom password-hash writes in `/api/users/password` with Better Auth password APIs.
2. Removing the second custom password-write path in manager reset to prevent continued lockout risk.
3. Making forgot/reset routes usable while signed out, with query-preserving redirect behavior.
4. Retargeting reset rate-limit and 429 monitoring from `/forget-password` to `/request-password-reset`.
5. Splitting Better Auth trusted origins by environment with deterministic validation behavior.
6. Enabling Better Auth reset-email callback wiring so reset routes are operational when invoked.

Out of scope for this bead:

- New global CSRF middleware for all custom API routes.
- New per-route throttling for custom `/api/users/*` endpoints beyond Better Auth route retargeting.

## 2) Findings mapped to code

1. `src/routes/api/users/password/+server.ts` currently performs custom `scrypt` verify/hash and writes `account.password` directly.
2. `src/routes/(manager)/admin/reset-password/+page.server.ts` also custom-hashes and writes `account.password` directly.
3. `src/hooks.server.ts` does not include `/forgot-password` or `/reset-password` in public paths.
4. `src/hooks.server.ts` unauth redirect only preserves `pathname` (drops query string).
5. `src/lib/server/auth-abuse-hardening.ts` uses stale reset rule key `/forget-password`.
6. `src/hooks.server.ts` 429 monitoring looks for `/api/auth/forget-password`.
7. `src/lib/server/auth.ts` uses static trusted origins mixing dev + wildcard hosts in all environments.

## 3) Implementation decisions

### A) Password API migration with explicit compatibility contract

1. In `/api/users/password`, call Better Auth server API `auth.api.changePassword` instead of touching DB password fields.
2. Pass request headers through so Better Auth can resolve session and apply its sensitive-session protections.
3. Use response-based handling (`asResponse`) to avoid brittle exception-type coupling and map outcomes deterministically.
4. Preserve current UI-facing contract for `AccountSection.svelte`:
   - Better Auth invalid current password -> `{ error: 'invalid_password' }` with 400.
   - Better Auth missing credential account -> `{ error: 'no_credential_account' }` with 400.
   - Other failures -> `{ error: 'password_update_failed' }` with safe status fallback.

### B) Manager reset migration (remove remaining lockout path)

1. In `src/routes/(manager)/admin/reset-password/+page.server.ts`, replace direct hash/write logic with `auth.api.setUserPassword`.
2. Resolve target user by email as today, but delegate password write to Better Auth for hashing compatibility.
3. Pass request headers to ensure Better Auth authz middleware evaluates manager permissions using real session context.
4. Keep existing validation and form-action UX contract where feasible.

### C) Signed-out forgot/reset flow repair

1. Add `/forgot-password` and `/reset-password` to public path allowlist in `src/hooks.server.ts`.
2. Update unauth redirect builder to preserve `pathname + search` so token-bearing query params survive.
3. Keep API-route unauth behavior (`401` JSON) unchanged.

### D) Reset throttle + monitoring retarget

1. Update `AUTH_RATE_LIMIT_RULES` reset key from `/forget-password` to `/request-password-reset` in `src/lib/server/auth-abuse-hardening.ts`.
2. Update `auth_rate_limit_exceeded` logging path check in `src/hooks.server.ts` to `/api/auth/request-password-reset`.
3. Keep sign-up/sign-in custom rules unchanged.

### E) Trusted origins environment split with deterministic validation

1. Add trusted-origin resolver in `src/lib/server/auth.ts`:
   - **dev defaults**: localhost origins only; optional LAN wildcard only in non-production.
   - **preview**: include explicit `https://${VERCEL_URL}` when present.
   - **production**: include explicit canonical production origins (`BETTER_AUTH_URL` and/or `VERCEL_PROJECT_PRODUCTION_URL`), no broad wildcard.
2. Support comma-separated override env var(s) for explicit operators.
3. Validation behavior:
   - **production**: invalid override entries fail fast at startup.
   - **non-production**: invalid override entries are dropped with warning logs.

### F) Reset-email callback wiring

1. Enable `emailAndPassword.sendResetPassword` in `src/lib/server/auth.ts` using existing `sendPasswordResetEmail` helper.
2. Keep current safe logging behavior in email helper (no account enumeration exposure from response contract).

## 4) Workstreams

### Workstream 1 - Password mutation hardening

Files:

- `src/routes/api/users/password/+server.ts`
- `src/routes/(manager)/admin/reset-password/+page.server.ts`

Expected outcome:

- No custom password hash/write path remains in app code.
- Password changes/resets remain sign-in compatible with Better Auth verifier.

### Workstream 2 - Auth-route access and redirect safety

Files:

- `src/hooks.server.ts`

Expected outcome:

- Signed-out users can reach forgot/reset pages.
- Redirect param preserves query tokens.

### Workstream 3 - Reset path rate-limit/monitoring alignment

Files:

- `src/lib/server/auth-abuse-hardening.ts`
- `src/hooks.server.ts`

Expected outcome:

- Reset throttling applies to active Better Auth endpoint path.
- 429 logging signal tracks live reset path.

### Workstream 4 - Trusted origins by environment

Files:

- `src/lib/server/auth.ts`
- `.env.example`
- `documentation/launch/signup-abuse-hardening.md`
- `CLAUDE.md`

Expected outcome:

- No broad wildcard trusted-origin policy in production.
- Environment-scoped behavior is documented for operators.

### Workstream 5 - Tests and validation

Files:

- `tests/server/authAbuseHardening.test.ts`
- `tests/server/authHardeningHooks.test.ts` (new helper-focused tests if needed)
- `tests/server/userPasswordRoute.test.ts` (new targeted mapping tests if needed)

Expected outcome:

- Deterministic coverage for path retargeting, redirect/query behavior, trusted-origin resolver, and password error mapping contract.

## 5) Acceptance criteria mapping

1. **Password changes remain Better Auth compatible**
   - Proven by migration of both custom write paths and targeted tests.
2. **Signed-out reset flow works end-to-end**
   - Proven by public auth route allowlist + redirect-query preservation and manual verification.
3. **Reset endpoint throttling verified on live path**
   - Proven by `/request-password-reset` rule + 429 monitor path + controlled verification.
4. **Trusted origins are environment-scoped and documented**
   - Proven by resolver implementation + docs updates.

## 6) Validation commands

```bash
pnpm test -- tests/server/authAbuseHardening.test.ts tests/server/authSignupOnboardingHook.test.ts
pnpm test -- tests/server/authHardeningHooks.test.ts tests/server/userPasswordRoute.test.ts
pnpm exec svelte-check --tsconfig ./tsconfig.json
```

Manual checks:

1. Signed-out navigation to `/forgot-password` and `/reset-password?token=test-token`.
2. Force reset-rate-limit 429s on `/api/auth/request-password-reset` and verify `auth_rate_limit_exceeded` logging context.
