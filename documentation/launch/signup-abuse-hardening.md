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

- Default production mode remains `allowlist` (`BETTER_AUTH_SIGNUP_POLICY=allowlist`).
- Production approvals are now stored in the `signup_onboarding` table (not in env vars).
- Managers can approve emails and issue one-time invites from Settings > Onboarding.
- Shared static invite headers are still ignored in production.
- Local/dev shared invite code remains available with `BETTER_AUTH_INVITE_CODE` for test workflows only.

### Manager approval flow

1. Manager opens **Settings > Onboarding**.
2. Manager either:
   - approves an email directly, or
   - issues a one-time invite code tied to an email with an expiry.
3. Driver signs up with that approved email (and invite code if invite flow is used).
4. On successful signup, the matching onboarding record is consumed exactly once.
5. Managers can review status transitions (pending, consumed, revoked, expired) in the same screen.

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

| Threat scenario                    | Mitigation                                                | Monitoring signal                                                                             |
| ---------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Bot-driven signup bursts           | Strict `/sign-up/*` limits + DB onboarding policy         | `auth_rate_limit_exceeded` logs with `/api/auth/sign-up` paths and HTTP `429` response spikes |
| Credential stuffing                | Tight `/sign-in/*` limits with persistent counters        | `auth_rate_limit_exceeded` logs with `/api/auth/sign-in` paths and repeated source IPs        |
| Shared invite leakage              | One-time invite consumption + revoke + expiry             | `auth_signup_blocked` logs with `reason=allowlist_denied`                                     |
| Invite header brute forcing in dev | `BETTER_AUTH_INVITE_CODE` check rejects invalid headers   | `auth_signup_blocked` logs with `reason=invalid_invite_code`                                  |
| Replay of previously used invite   | Atomic consume-on-signup prevents second successful usage | `auth_signup_onboarding_not_consumed` warnings if signup succeeds but consume did not occur   |

## Verification evidence

- Automated tests:
  - `tests/server/authAbuseHardening.test.ts`
  - `tests/server/authSignupOnboardingHook.test.ts`
  - `tests/server/onboardingService.test.ts`
- Configuration and policy implementation:
  - `src/lib/server/auth-abuse-hardening.ts`
  - `src/lib/server/auth.ts`
  - `src/lib/server/services/onboarding.ts`
  - `src/routes/api/onboarding/+server.ts`
  - `src/hooks.server.ts`
- Persistent storage schema:
  - `src/lib/server/db/schema.ts`
  - `drizzle/0009_aromatic_thunderbolt_ross.sql`
