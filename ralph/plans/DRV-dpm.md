# Audit notifications and onboarding services

Task: DRV-dpm

## Steps

1. Build a control matrix covering all required review areas (FCM failures, batching, templates, invite lifecycle, signup policy, validation, error states, log sensitivity), mapping each control to exact code paths in `src/lib/server/services/notifications.ts`, `src/lib/server/services/onboarding.ts`, and any directly referenced validators/config/persistence call sites; mark each control `covered` or `not found` before writing findings.
2. Audit notifications behavior for each failure class (`invalid token`, `expired token`, `quota/rate limit`, `transient network`, `unknown Firebase error`) and document disposition (retry/drop/escalate/log); explicitly verify Firebase Admin multicast batching against documented limit (`<=500 tokens/request`) and cite the source used.
3. Audit notification template completeness and payload safety by enumerating every supported notification type, its required data keys, fallback behavior for missing keys, and whether message body/title/data can expose sensitive information in logs or pushes.
4. Audit onboarding invite lifecycle and policy enforcement across create/accept/revoke/expiry paths, including duplicate invite handling, revoked/expired acceptance rejection, allowlist-vs-open signup policy gates, and email validation boundaries.
5. Write `logs/nightly/2026-02-10/audit-services-notifications-onboarding.md` with: control matrix results, findings grouped by severity (`critical/high/medium/low`), `impact x likelihood` severity rationale, `file:line` evidence for each finding, remediation guidance, and an `Unverified/Follow-up` section for assumptions or checks needing runtime validation.

## Acceptance Criteria

- Audit explicitly evaluates FCM error handling for token expiry, invalid tokens, quota limits, and network failures.
- Audit verifies bulk notification batching against Firebase constraints (including explicit limit source citation) and identifies operational risk if limits are exceeded.
- Audit confirms notification template completeness and behavior for missing/invalid template data.
- Audit verifies onboarding invite lifecycle coverage: creation, acceptance, revocation, and expiry paths.
- Audit verifies signup policy enforcement, email validation, and handling for duplicate/revoked/expired invite scenarios.
- Findings are written to `logs/nightly/2026-02-10/audit-services-notifications-onboarding.md` with control-level pass/fail coverage, severity ratings, `file:line` evidence, actionable remediation notes, and explicit unverified assumptions/follow-ups.
