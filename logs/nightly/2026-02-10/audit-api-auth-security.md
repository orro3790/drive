# DRV-4ff Nightly Audit - Auth, User, and Security-Critical Endpoints

Date: 2026-02-10
Task: DRV-4ff

## Scope

- `src/routes/(auth)/sign-in/+page.svelte`
- `src/routes/(auth)/sign-up/+page.svelte`
- `src/routes/(auth)/forgot-password/+page.svelte`
- `src/routes/(auth)/reset-password/+page.svelte`
- `src/routes/api/users/me/+server.ts`
- `src/routes/api/users/password/+server.ts`
- `src/routes/api/users/fcm-token/+server.ts`
- `src/lib/server/auth.ts`
- `src/lib/server/auth-abuse-hardening.ts`
- `src/hooks.server.ts`
- `src/lib/server/db/auth-schema.ts`
- `drizzle/0010_refresh_rate_limit_schema.sql`
- Supporting runtime behavior inspection:
  - `node_modules/better-auth/dist/api/routes/password.mjs`
  - `node_modules/better-auth/dist/api/rate-limiter/index.mjs`
  - `node_modules/better-auth/dist/cookies/index.mjs`
  - `node_modules/better-auth/dist/context/create-context.mjs`
  - `node_modules/better-auth/dist/crypto/password.mjs`
  - `node_modules/better-auth/dist/auth/trusted-origins.mjs`

## Findings Summary

- Critical: 1
- High: 3
- Medium: 3
- Low: 1

## Findings

### CRITICAL - `/api/users/password` writes password hashes that Better Auth cannot verify

- Evidence:
  - Custom endpoint hashes with Node `crypto.scrypt` defaults and stores `salt:hex` directly (`src/routes/api/users/password/+server.ts:18`, `src/routes/api/users/password/+server.ts:21`).
  - Better Auth verifier uses fixed scrypt params (`N=16384`, `r=16`, `p=1`) (`node_modules/better-auth/dist/crypto/password.mjs:8`, `node_modules/better-auth/dist/crypto/password.mjs:31`).
  - App does not override Better Auth password hasher/verifier in config (`src/lib/server/auth.ts:50`).
  - Runtime check in this audit session: hashing with the current endpoint logic then validating via Better Auth verifier returned `{"ok":false}`.
- Impact: Users who change passwords via `/api/users/password` can be locked out on next sign-in; this is both an availability and account-recovery incident risk.
- Recommendation: Replace custom password hashing/update with Better Auth's password-change API flow, or wire exactly the same hasher/verifier implementation used by Better Auth.

### HIGH - Password reset user flow is currently not usable for signed-out users

- Evidence:
  - Auth pages marked public do not include `/forgot-password` or `/reset-password` (`src/hooks.server.ts:12`).
  - Unauthenticated requests are redirected using only `pathname`, dropping token-bearing query strings (`src/hooks.server.ts:63`).
  - `forgot-password` and `reset-password` pages exist and expect anonymous use (`src/routes/(auth)/forgot-password/+page.svelte:24`, `src/routes/(auth)/reset-password/+page.svelte:14`).
  - Sign-in page comments indicate reset is currently disabled (`src/routes/(auth)/sign-in/+page.svelte:146`).
- Impact: If reset email is enabled, callback tokens can still be lost before reaching reset UI; currently, self-service recovery is effectively disabled for signed-out users.
- Recommendation: Either (1) make reset routes explicitly public and preserve full redirect URL (including query), or (2) remove/feature-flag pages until reset is fully enabled.

### HIGH - Password reset rate-limit and monitoring rules target an outdated endpoint path

- Evidence:
  - Custom auth rate-limit rule uses `/forget-password` (`src/lib/server/auth-abuse-hardening.ts:52`).
  - 429 logging guard also checks `/api/auth/forget-password` (`src/hooks.server.ts:33`).
  - Better Auth endpoint in this version is `/request-password-reset` (`node_modules/better-auth/dist/api/routes/password.mjs:23`).
  - With this mismatch, reset requests fall back to broader global limits (`src/lib/server/auth.ts:49`, `src/lib/server/auth-abuse-hardening.ts:55`).
- Impact: Intended strict reset throttling is not applied; alerting for reset abuse is also blind to the active route.
- Recommendation: Rename custom rule and 429 logging checks to `/request-password-reset` and validate in staging with controlled 429 tests.

### HIGH - `trustedOrigins` is overly permissive and not separated by environment

- Evidence:
  - Static list trusts localhost, LAN wildcard, and all `*.vercel.app` regardless of runtime environment (`src/lib/server/auth.ts:48`).
  - Better Auth origin/callback enforcement relies on trusted-origin matching for CSRF-sensitive auth endpoints (`node_modules/better-auth/dist/api/middlewares/origin-check.mjs:87`).
  - Wildcard origin matching supports broad host patterns (`node_modules/better-auth/dist/auth/trusted-origins.mjs:19`).
- Impact: In production, callback/origin checks may accept development hosts and unrelated Vercel origins, increasing redirect and cross-origin attack surface.
- Recommendation: Build `trustedOrigins` from environment-specific allowlists (prod-only domains in production, localhost only in dev).

### MEDIUM - State-changing `/api/users/*` routes do not enforce explicit origin/CSRF checks

- Evidence:
  - `PATCH /api/users/me` has auth and validation checks but no origin/referer/CSRF gate (`src/routes/api/users/me/+server.ts:15`).
  - `POST /api/users/password` and `POST/DELETE /api/users/fcm-token` similarly have no explicit origin/CSRF checks (`src/routes/api/users/password/+server.ts:33`, `src/routes/api/users/fcm-token/+server.ts:15`).
  - Current safety depends on cookie defaults and browser behavior, not route-level defense.
- Impact: Defense-in-depth is weaker for authenticated state changes.
- Recommendation: Add shared middleware for origin checks on non-GET authenticated API routes.

### MEDIUM - Sensitive authenticated endpoints lack dedicated brute-force/abuse throttling

- Evidence:
  - `/api/users/password` and `/api/users/fcm-token` contain no route-level throttling (`src/routes/api/users/password/+server.ts:33`, `src/routes/api/users/fcm-token/+server.ts:15`).
  - Auth limiter currently applies to Better Auth endpoints only (`node_modules/better-auth/dist/api/rate-limiter/index.mjs:100`).
- Impact: A hijacked session can attempt high-frequency password verification attempts and token churn without endpoint-specific limits.
- Recommendation: Add per-user and per-IP rate limiting on sensitive custom API routes.

### MEDIUM - Custom password update path bypasses Better Auth post-reset/session lifecycle controls

- Evidence:
  - Custom endpoint updates `account.password` directly (`src/routes/api/users/password/+server.ts:66`).
  - Better Auth reset path supports lifecycle hooks and optional session revocation (`node_modules/better-auth/dist/api/routes/password.mjs:159`, `node_modules/better-auth/dist/api/routes/password.mjs:163`).
- Impact: Existing sessions may remain active after password change; hooks/auditing tied to Better Auth flow are skipped.
- Recommendation: Route password changes through Better Auth APIs or replicate lifecycle controls explicitly.

### LOW - Rate-limit table retention strategy is not documented

- Evidence:
  - Schema is structurally consistent (`src/lib/server/db/auth-schema.ts:87`, `drizzle/0010_refresh_rate_limit_schema.sql:2`).
  - No cleanup/retention task for `rate_limit` was found in reviewed scope.
- Impact: Table growth behavior is unclear over long periods in production.
- Recommendation: Document retention expectations or add periodic cleanup if key cardinality grows materially.

## Checks Completed (No Immediate Defect Found)

- Production signup allowlist path is enforced through onboarding authorization in production mode (`src/lib/server/auth-abuse-hardening.ts:177`, `src/lib/server/auth-abuse-hardening.ts:268`).
- Password reset enumeration resistance appears implemented by Better Auth (uniform success response for unknown email plus timing-noise behavior) (`node_modules/better-auth/dist/api/routes/password.mjs:50`, `node_modules/better-auth/dist/api/routes/password.mjs:60`).
- Reset token expiry and one-time token invalidation are implemented in Better Auth (`node_modules/better-auth/dist/api/routes/password.mjs:63`, `node_modules/better-auth/dist/api/routes/password.mjs:158`).
- Session cookie defaults include `httpOnly`, `sameSite=lax`, and conditional secure-cookie behavior; session expiry defaults to 7 days (`node_modules/better-auth/dist/cookies/index.mjs:28`, `node_modules/better-auth/dist/cookies/index.mjs:31`, `node_modules/better-auth/dist/context/create-context.mjs:122`).
- `FCM` token endpoints require authenticated users and only update the caller's record (`src/routes/api/users/fcm-token/+server.ts:16`, `src/routes/api/users/fcm-token/+server.ts:43`).
- No `{@html ...}` usage was found in auth page components under `src/routes/(auth)/`, reducing reflected/stored XSS risk from rendered error text.

## Requirement-to-Evidence Traceability Matrix

| Requirement                                                        | Status  | Evidence                                                                                                                                                            | Notes                                                                                                  |
| ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Better Auth config (session expiry, cookie settings, CSRF)         | PARTIAL | `src/lib/server/auth.ts:43`, `node_modules/better-auth/dist/cookies/index.mjs:28`, `node_modules/better-auth/dist/context/create-context.mjs:122`                   | Cookie/session defaults are secure by default; trusted-origin policy and CSRF posture need tightening. |
| Signup allowlist enforcement in production                         | PASS    | `src/lib/server/auth-abuse-hardening.ts:177`, `src/lib/server/auth-abuse-hardening.ts:268`                                                                          | Production allowlist uses onboarding authorization gate.                                               |
| Password reset token expiry, rate limiting, enumeration prevention | PARTIAL | `node_modules/better-auth/dist/api/routes/password.mjs:63`, `node_modules/better-auth/dist/api/routes/password.mjs:60`, `src/lib/server/auth-abuse-hardening.ts:52` | Expiry and enumeration protections exist; reset route throttling is mis-targeted.                      |
| FCM token registration auth                                        | PASS    | `src/routes/api/users/fcm-token/+server.ts:16`, `src/routes/api/users/fcm-token/+server.ts:43`                                                                      | Authn/authz scope is user-owned record only.                                                           |
| Rate limiting on login/password reset/API                          | FAIL    | `src/lib/server/auth-abuse-hardening.ts:50`, `src/lib/server/auth-abuse-hardening.ts:52`, `src/routes/api/users/password/+server.ts:33`                             | Login covered; reset path mismatched; custom sensitive API endpoints unthrottled.                      |
| Session security (`httpOnly`, `sameSite`, `secure`)                | PASS    | `node_modules/better-auth/dist/cookies/index.mjs:28`, `node_modules/better-auth/dist/cookies/index.mjs:29`, `node_modules/better-auth/dist/cookies/index.mjs:31`    | Defaults satisfy baseline controls.                                                                    |
| XSS in auth pages                                                  | PASS    | `src/routes/(auth)/sign-in/+page.svelte:65`, `src/lib/components/primitives/NoticeBanner.svelte:62`                                                                 | No raw HTML rendering paths found in reviewed auth pages.                                              |
| Trusted origins for prod vs dev                                    | FAIL    | `src/lib/server/auth.ts:48`, `node_modules/better-auth/dist/api/middlewares/origin-check.mjs:87`                                                                    | Single static allowlist mixes dev and prod origins.                                                    |
| Rate-limit schema correctness                                      | PASS    | `src/lib/server/db/auth-schema.ts:87`, `drizzle/0010_refresh_rate_limit_schema.sql:2`, `node_modules/better-auth/dist/api/rate-limiter/index.mjs:25`                | Schema aligns with runtime `rateLimit` model fields.                                                   |

## Priority Fix Order

1. Replace custom password hashing/update in `/api/users/password` with Better Auth-compatible flow.
2. Fix password reset route availability and query-preserving redirect behavior for signed-out users.
3. Correct reset rate-limit and 429 monitoring path to `/request-password-reset`.
4. Split `trustedOrigins` by environment and remove broad production wildcards.
5. Add origin checks and per-route throttling for state-changing custom `/api/users/*` endpoints.
