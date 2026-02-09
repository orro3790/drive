# DRV-dpm Nightly Audit - Notifications and Onboarding Services

Date: 2026-02-10
Task: DRV-dpm

## Scope

- `src/lib/server/services/notifications.ts`
- `src/lib/server/services/onboarding.ts`
- `src/lib/server/auth-abuse-hardening.ts`
- `src/lib/server/auth.ts`
- `src/routes/api/onboarding/+server.ts`
- `src/routes/api/onboarding/[id]/revoke/+server.ts`
- `src/lib/schemas/onboarding.ts`
- `src/lib/server/db/schema.ts`
- `src/lib/server/logger.ts`
- `tests/server/onboardingService.test.ts`
- `tests/server/authSignupOnboardingHook.test.ts`
- External operational reference:
  - Firebase Admin SDK docs (`https://firebase.google.com/docs/cloud-messaging/send/admin-sdk`)

## Findings Summary

- Critical: 1
- High: 2
- Medium: 2
- Low: 0

## Findings

### CRITICAL - Production allowlist has a TOCTOU gap that can admit unauthorized signups

- Evidence:
  - Signup gate authorizes first (`resolveProductionAuthorization`) in the pre-signup hook (`src/lib/server/auth-abuse-hardening.ts:268`).
  - Onboarding consumption happens only after successful signup response payload exists (`src/lib/server/auth-abuse-hardening.ts:312`, `src/lib/server/auth-abuse-hardening.ts:323`).
  - If consumption fails or returns `null`, flow only logs warning/error and does not block or compensate (`src/lib/server/auth-abuse-hardening.ts:329`, `src/lib/server/auth-abuse-hardening.ts:338`).
  - Service explicitly returns `null` when invite/approval is no longer consumable (`src/lib/server/services/onboarding.ts:271`, `src/lib/server/services/onboarding.ts:295`), and concurrency tests already model one winner + one `null` consume (`tests/server/onboardingService.test.ts:210`, `tests/server/onboardingService.test.ts:233`).
- Severity rationale (`impact x likelihood`): High impact (unauthorized account creation in production allowlist mode) x medium likelihood (race window under concurrent signups/revocations) = **Critical**.
- Recommendation: Make authorization consumption atomic with account creation (reserve/consume before user creation in a transaction-capable flow), or enforce compensating rollback/disable when post-signup consume fails.

### HIGH - FCM failure handling is not classified by failure type and does not remediate invalid tokens

- Evidence:
  - All push send failures are collapsed to `push_failed` regardless of cause (`src/lib/server/services/notifications.ts:292`).
  - Logged error detail is reduced to error name via `toSafeErrorMessage`, dropping actionable Firebase error code context (`src/lib/server/services/notifications.ts:291`, `src/lib/server/logger.ts:159`).
  - Invalid token remediation is explicitly deferred and not implemented (`src/lib/server/services/notifications.ts:295`).
  - Emergency notification path also logs generic failure only, without code-based handling (`src/lib/server/services/notifications.ts:523`).
- Severity rationale (`impact x likelihood`): Medium-high impact (repeat delivery failures, no automatic token hygiene, weak incident triage for quota/network issues) x high likelihood (FCM token churn is common) = **High**.
- Recommendation: Parse Firebase Admin error codes, clear tokens for terminal token errors, and separate transient (`network/quota`) from terminal (`not-registered/invalid`) handling with retry/backoff policy.

### HIGH - Bulk delivery path underuses Firebase batch primitives and loses per-token outcome visibility

- Evidence:
  - Bulk API loops single-recipient sends with fixed `BATCH_SIZE = 10` and no multi-token send API usage (`src/lib/server/services/notifications.ts:317`, `src/lib/server/services/notifications.ts:322`).
  - Emergency path repeats same `BATCH_SIZE = 10` pattern and performs per-driver token lookup inside batch loop (`src/lib/server/services/notifications.ts:490`, `src/lib/server/services/notifications.ts:495`).
  - No `sendEachForMulticast`/batch response processing is present, so failed-token sets are not captured for cleanup.
  - Firebase Admin SDK guidance supports up to 500 registration tokens per multicast invocation with ordered per-token responses (Firebase docs: `https://firebase.google.com/docs/cloud-messaging/send/admin-sdk`).
- Severity rationale (`impact x likelihood`): Medium impact (throughput and observability degradation at scale) x high likelihood (nightly/broadcast fan-out paths) = **High**.
- Recommendation: Gather tokens first, dispatch via `sendEachForMulticast` (<=500 tokens/request) or `sendEach` batches, and persist per-token outcomes for cleanup/retry.

### MEDIUM - Duplicate pending onboarding entries are possible under concurrent manager actions

- Evidence:
  - Create approval and create invite both do check-then-insert without lock or conflict target (`src/lib/server/services/onboarding.ts:318`, `src/lib/server/services/onboarding.ts:338`, `src/lib/server/services/onboarding.ts:362`, `src/lib/server/services/onboarding.ts:385`).
  - Schema enforces only `token_hash` uniqueness; there is no unique pending constraint on `(email, kind)` (`src/lib/server/db/schema.ts:348`, `src/lib/server/db/schema.ts:351`).
- Severity rationale (`impact x likelihood`): Medium impact (duplicate pending records complicate revocation, auditability, and deterministic consume behavior) x medium likelihood (manager double-submit/concurrent admin actions) = **Medium**.
- Recommendation: Add a partial unique index for pending entries (`email`, `kind`) and handle conflict by returning existing pending entry.

### MEDIUM - Onboarding creation endpoint does not convert malformed JSON into a controlled 400 response

- Evidence:
  - Endpoint parses body with raw `await request.json()` before schema validation (`src/routes/api/onboarding/+server.ts:35`, `src/routes/api/onboarding/+server.ts:36`).
  - No JSON parse guard exists, so malformed JSON bypasses validation branch and can surface as unhandled server error.
- Severity rationale (`impact x likelihood`): Low-medium impact (API contract inconsistency and noisy error telemetry) x medium likelihood (client bugs/malformed requests) = **Medium**.
- Recommendation: Wrap JSON parse in try/catch and return explicit `400` (`invalid_json`) before schema validation.

## Checks Completed (No Immediate Defect Found)

- Notification template coverage is compile-time complete for all declared notification types via `Record<NotificationType, ...>` (`src/lib/server/services/notifications.ts:32`, `src/lib/server/services/notifications.ts:61`).
- Onboarding API manager-only access control is present on list/create/revoke endpoints (`src/routes/api/onboarding/+server.ts:18`, `src/routes/api/onboarding/[id]/revoke/+server.ts:11`).
- Email format validation is enforced at API boundary using Zod email schema (`src/lib/schemas/onboarding.ts:3`, `src/routes/api/onboarding/+server.ts:36`).
- Invite codes are not stored in plaintext; only SHA-256 hash is persisted (`src/lib/server/services/onboarding.ts:100`, `src/lib/server/services/onboarding.ts:383`).
- One-time consume semantics are protected by conditional update on pending + unexpired state (`src/lib/server/services/onboarding.ts:211`, `src/lib/server/services/onboarding.ts:214`).
- Logger redaction includes high-risk fields (`email`, `token`, `fcmToken`, `authorization`, `ip`) (`src/lib/server/logger.ts:17`, `src/lib/server/logger.ts:49`, `src/lib/server/logger.ts:86`).

## Requirement-to-Evidence Traceability Matrix

| Requirement                                                         | Status  | Evidence                                                                                                                                       | Notes                                                                                         |
| ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| FCM error handling (token expiry/invalid/quota/network)             | FAIL    | `src/lib/server/services/notifications.ts:288`, `src/lib/server/services/notifications.ts:292`, `src/lib/server/services/notifications.ts:295` | No code-path distinction between terminal/transient failure classes.                          |
| Bulk notification batching vs Firebase limits                       | PARTIAL | `src/lib/server/services/notifications.ts:317`, `src/lib/server/services/notifications.ts:490`, Firebase docs                                  | Concurrency batching exists, but not Firebase-native multicast batching/response handling.    |
| Notification template completeness                                  | PASS    | `src/lib/server/services/notifications.ts:32`, `src/lib/server/services/notifications.ts:61`                                                   | Type-level coverage prevents missing templates for declared types.                            |
| Onboarding invite lifecycle (create/accept/revoke/expiry)           | PARTIAL | `src/lib/server/services/onboarding.ts:312`, `src/lib/server/services/onboarding.ts:405`, `src/lib/server/services/onboarding.ts:104`          | Core lifecycle exists; production signup flow has atomicity gap at consume stage.             |
| Signup policy enforcement (allowlist vs open)                       | PARTIAL | `src/lib/server/auth-abuse-hardening.ts:81`, `src/lib/server/auth-abuse-hardening.ts:268`, `src/lib/server/auth-abuse-hardening.ts:329`        | Policy modes resolve correctly; enforce/consume split weakens allowlist guarantee under race. |
| Email validation                                                    | PARTIAL | `src/lib/schemas/onboarding.ts:3`, `src/routes/api/onboarding/+server.ts:35`                                                                   | Strong at route boundary; malformed JSON path is not normalized to 400.                       |
| Error states (duplicate invite, revoked acceptance, expired invite) | PARTIAL | `src/routes/api/onboarding/+server.ts:47`, `src/lib/server/services/onboarding.ts:108`, `src/lib/server/services/onboarding.ts:295`            | Duplicate returns 409 in normal flow; concurrent duplicate creation still possible.           |
| Sensitive data in logs                                              | PASS    | `src/lib/server/logger.ts:17`, `src/lib/server/logger.ts:86`, `src/lib/server/services/notifications.ts:291`                                   | Redaction baseline is good; observability detail is reduced for FCM diagnostics.              |

## Unverified / Follow-up Checks

- Runtime simulation of Firebase-specific quota and transient network failures was not executed in this audit session; recommendations are code-path based.
- End-to-end Better Auth behavior for compensating rollback after `after` hook failures should be validated in integration tests against real auth routes.

## Priority Fix Order

1. Close production allowlist TOCTOU gap in signup authorization/consumption.
2. Implement typed FCM error handling with terminal token cleanup and transient retry strategy.
3. Rework bulk notification fan-out to Firebase batch APIs with per-token outcome tracking.
4. Add DB-level pending uniqueness guard for onboarding entries.
5. Normalize malformed onboarding JSON requests to explicit 400 responses.
