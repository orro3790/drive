# LC-06: Production Signup Abuse Hardening

Last updated: 2026-02-09  
Capability: `LC-06`  
Bead: `DRV-17l.4`

## Objective

Reduce signup and sign-in abuse risk at launch by enforcing:

1. Persistent auth rate limits (database-backed counters).
2. Production onboarding controls that avoid shared static invite codes.
3. Clear operator signals for blocked signup attempts and rate-limit bursts.

## Production onboarding policy

- Default production mode is `allowlist` (`BETTER_AUTH_SIGNUP_POLICY=allowlist`).
- Approved emails are defined in `BETTER_AUTH_SIGNUP_ALLOWLIST` (comma-separated).
- Shared invite headers (`x-invite-code`) are ignored in production.
- Local/dev shared invite code remains available with `BETTER_AUTH_INVITE_CODE` for test workflows only.

### Manager approval flow

1. Manager or release owner approves a new driver onboarding request.
2. Approved email is added to `BETTER_AUTH_SIGNUP_ALLOWLIST` in Vercel env vars.
3. Deployment restarts with updated env vars.
4. Driver completes signup using the approved email.

## Auth rate limits (persistent)

Configured in `src/lib/server/auth-abuse-hardening.ts` and persisted via `rate_limit` table.

| Endpoint pattern         | Window | Max requests | Purpose                                   |
| ------------------------ | ------ | ------------ | ----------------------------------------- |
| `/sign-up/*`             | 15 min | 3            | Slow down bot signups and invite probing  |
| `/sign-in/*`             | 5 min  | 5            | Reduce credential stuffing burst impact   |
| `/forget-password`       | 10 min | 3            | Throttle reset-link abuse                 |
| global auth default rule | 60 sec | 60           | Catch-all safety net for other auth paths |

Storage mode is set to `database`, so counters survive across instances and cold starts.

## Abuse scenarios, mitigations, and monitoring signals

| Threat scenario                    | Mitigation                                                 | Monitoring signal                                                                             |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bot-driven signup bursts           | Strict `/sign-up/*` limits + allowlist policy              | `auth_rate_limit_exceeded` logs with `/api/auth/sign-up` paths and HTTP `429` response spikes |
| Credential stuffing                | Tight `/sign-in/*` limits with persistent counters         | `auth_rate_limit_exceeded` logs with `/api/auth/sign-in` paths and repeated source IPs        |
| Shared invite leakage              | Production ignores shared invite codes; allowlist required | `auth_signup_blocked` logs with `reason=allowlist_denied`                                     |
| Invite header brute forcing in dev | `BETTER_AUTH_INVITE_CODE` check rejects invalid headers    | `auth_signup_blocked` logs with `reason=invalid_invite_code`                                  |

## Verification evidence

- Automated tests:
  - `tests/server/authAbuseHardening.test.ts`
- Configuration and policy implementation:
  - `src/lib/server/auth-abuse-hardening.ts`
  - `src/lib/server/auth.ts`
  - `src/hooks.server.ts`
- Persistent storage schema:
  - `src/lib/server/db/auth-schema.ts`
  - `drizzle/0008_conscious_randall_flagg.sql`
