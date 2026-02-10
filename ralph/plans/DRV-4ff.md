# Audit auth, user, and security-critical endpoints

Task: DRV-4ff

## Steps

1. Build a source-of-truth checklist for all audit targets: `src/routes/(auth)/sign-in`, `src/routes/(auth)/sign-up`, `src/routes/(auth)/forgot-password`, `src/routes/(auth)/reset-password`, `src/routes/api/users/me`, `src/routes/api/users/password`, `src/routes/api/users/fcm-token`, `src/lib/server/auth.ts`, and `drizzle/0010_refresh_rate_limit_schema.sql`.
2. Audit `src/lib/server/auth.ts` and related auth wiring for Better Auth production configuration: session expiry values, cookie flags (`httpOnly`, `sameSite`, `secure`), CSRF protections, and trusted-origin separation between dev and prod with fail-closed behavior when environment configuration is missing or mis-set.
3. Audit auth pages and flows for signup allowlist enforcement in production, password reset security (token expiry, one-time use/invalidation, anti-enumeration response parity), and XSS exposure in user-controlled render paths.
4. Audit `src/routes/api/users/` endpoints for authentication/authorization enforcement (including FCM token registration), explicit CSRF protections on state-changing routes, and rate-limiting coverage and behavior for login, password reset, and sensitive API paths.
5. Audit `drizzle/0010_refresh_rate_limit_schema.sql` for schema correctness (keys, indexes/constraints, window semantics, retention assumptions) and consistency with runtime rate-limit enforcement, then record findings in `logs/nightly/2026-02-10/audit-api-auth-security.md` with `critical/high/medium/low` severities, a requirement-to-evidence traceability matrix, and concise remediation recommendations.

## Acceptance Criteria

- Audit covers all specified auth pages, user API endpoints, `src/lib/server/auth.ts`, and rate-limit schema file.
- Review explicitly evaluates Better Auth/session settings, CSRF, trusted origins, and production cookie security.
- Review explicitly verifies signup allowlist behavior plus password reset token expiry, one-time-use/invalidation, and account enumeration resistance.
- Review explicitly verifies auth requirements for user endpoints including FCM token registration, CSRF protections on state-changing routes, and rate limiting on login/password reset/API paths.
- Review explicitly validates `drizzle/0010_refresh_rate_limit_schema.sql` correctness (constraints/indexes/window semantics) and consistency with runtime rate-limit behavior.
- Findings are written to `logs/nightly/2026-02-10/audit-api-auth-security.md` with severity ratings, file-path evidence, and a requirement-to-evidence traceability matrix.
