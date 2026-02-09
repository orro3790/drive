# Launch Capability Matrix and Confidence Checklist

Last updated: 2026-02-09  
Epic: `DRV-17l`  
Document owner: Matt (release owner)

This is the manager-facing source of truth for launch readiness. It tracks what must work at launch, how each area is verified, current confidence, and where the evidence lives.

## Status legend

- `PASS`: capability is implemented and verified with linked evidence.
- `IN_PROGRESS`: work started, but verification is not complete.
- `NOT_STARTED`: planned capability with no verification evidence yet.

## Capability matrix

| Capability ID | Launch capability                             | Expected behavior at launch                                                                                                  | Owner                            | Verification coverage                                            | Edge cases tracked                                                                           | Latest status | Confidence | Evidence |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- | ---------- | -------- |
| `LC-01`       | Safe Android release build guardrails         | Release packaging only runs with secure configuration (HTTPS runtime URL + complete signing setup) and fails fast otherwise. | Mobile engineering               | Automated preflight + manual command validation                  | Missing URL, non-HTTPS URL, missing signing file, placeholder secrets, missing keystore path | `PASS`        | High       | `E-01`   |
| `LC-02`       | Signed artifact generation and validity proof | Release AAB/APK are generated, cryptographic hashes are captured, and signer identity is verified.                           | Mobile engineering               | Manual release run + cryptographic verification evidence         | Artifact missing, signing mismatch, upload-key custody risk                                  | `PASS`        | High       | `E-02`   |
| `LC-03`       | Manager-safe private rollout and rollback     | Managers can release to Closed Testing, monitor first installs, halt quickly, and recover through hotfix rollout.            | Mobile engineering + Ops manager | Manual SOP walkthrough + install verification checklist          | Failed first installs, bad rollout requiring halt, rollback communications                   | `PASS`        | High       | `E-03`   |
| `LC-04`       | Launch confidence source of truth             | Managers have one readable checklist with capability IDs, ownership, status, and evidence links.                             | Release owner                    | Manual documentation review                                      | Stale status, missing evidence links, unclear ownership                                      | `PASS`        | High       | `E-04`   |
| `LC-05`       | Deterministic lifecycle/API/cron coverage     | Launch-critical service and cron behavior is covered by deterministic tests mapped to capability IDs.                        | Backend engineering              | Automated Vitest coverage + deterministic fixtures/time controls | Idempotency failures, boundary-time logic, actionable failure reporting                      | `PASS`        | High       | `E-05`   |
| `LC-06`       | Production signup abuse hardening             | Signup/sign-in enforce persistent rate limits and production onboarding policy (invite/allowlist/approval) to reduce abuse.  | Auth/security engineering        | Automated auth tests + manual abuse scenario checks              | Bot bursts, credential stuffing, static/shared invite leakage                                | `PASS`        | High       | `E-06`   |
| `LC-07`       | Dual-session launch verification and go/no-go | Manager and driver sessions are verified together, cron dry-runs are validated, and a formal go/no-go report is published.   | QA + release owner               | Manual dual-session E2E run + launch report review               | Real-time state drift, cron side effects, blocker triage ownership                           | `NOT_STARTED` | Low        | `E-07`   |

## Launch confidence roll-up (current)

- Capabilities tracked: 7
- `PASS`: 6 (`LC-01` to `LC-06`)
- `IN_PROGRESS`: 0
- `NOT_STARTED`: 1 (`LC-07`)
- Current launch decision: `NO-GO` until `LC-07` is completed and verified.

## Evidence register

| Evidence ID | What it proves                                                                                                                          | Evidence link(s)                                                                                                                                                                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E-01`      | Android release guardrails are defined and enforced.                                                                                    | `documentation/mobile/android-private-distribution.md#security-and-release-guardrails`, `documentation/mobile/android-private-distribution.md#release-preflight-behavior-enforced`, `scripts/mobile/android-gradle.mjs`                                                                                                                                                                |
| `E-02`      | Signed release artifacts were produced and verified with hashes and signer fingerprint.                                                 | `documentation/mobile/android-private-distribution.md#evidence-checklist-for-launch-review`, `.beads/issues.jsonl` (`DRV-17l.1` completion evidence comment records SHA256 + signer fingerprint)                                                                                                                                                                                       |
| `E-03`      | Manager workflow exists for private rollout, first-install checks, and rollback-by-hotfix.                                              | `documentation/mobile/android-private-distribution.md#manager-sop-non-technical`, `documentation/mobile/android-private-distribution.md#rollback-playbook-rollback-by-hotfix`                                                                                                                                                                                                          |
| `E-04`      | This checklist exists in-repo as the manager-readable launch source of truth.                                                           | `documentation/launch/launch-capability-matrix.md`                                                                                                                                                                                                                                                                                                                                     |
| `E-05`      | Deterministic lifecycle, API boundary, and cron decision logic is covered with boundary-time, idempotency, and failure-path assertions. | `tests/server/assignmentLifecycle.test.ts`, `tests/server/assignmentsConfirmApi.test.ts`, `tests/server/cronAutoDropUnconfirmedApi.test.ts`, `tests/server/cronSendConfirmationRemindersApi.test.ts`, `tests/server/cronCloseBidWindowsApi.test.ts`, `tests/server/noShowDetectionService.test.ts`, `tests/server/noShowDetectionCronApi.test.ts`, `.beads/issues.jsonl` (`DRV-17l.3`) |
| `E-06`      | Signup and sign-in abuse hardening is implemented with persistent rate limits, production allowlist onboarding, and monitoring signals. | `src/lib/server/auth-abuse-hardening.ts`, `src/lib/server/auth.ts`, `src/hooks.server.ts`, `src/lib/server/db/auth-schema.ts`, `drizzle/0008_conscious_randall_flagg.sql`, `tests/server/authAbuseHardening.test.ts`, `documentation/launch/signup-abuse-hardening.md`, `.beads/issues.jsonl` (`DRV-17l.4`)                                                                            |
| `E-07`      | Scope/acceptance for dual-session verification and go/no-go reporting is defined and pending implementation.                            | `.beads/issues.jsonl` (`DRV-17l.5`)                                                                                                                                                                                                                                                                                                                                                    |

## LC-05 automated test map

| Layer               | Capability mapping | Vitest suite                                            | Coverage focus                                                                                     |
| ------------------- | ------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Lifecycle service   | `LC-05`            | `tests/server/assignmentLifecycle.test.ts`              | Confirmation/cancelability boundaries, lifecycle transition states, timezone day-boundary handling |
| Assignment API      | `LC-05`            | `tests/server/assignmentsConfirmApi.test.ts`            | Auth contract, deterministic success payload, and idempotency (`Assignment already confirmed`)     |
| Cron decision logic | `LC-05`            | `tests/server/cronAutoDropUnconfirmedApi.test.ts`       | 48-hour threshold behavior, per-assignment error isolation, aggregate cron counters                |
| Cron decision logic | `LC-05`            | `tests/server/cronSendConfirmationRemindersApi.test.ts` | Deterministic reminder date, null-user guard, and per-send error isolation                         |
| Cron decision logic | `LC-05`            | `tests/server/cronCloseBidWindowsApi.test.ts`           | Resolve/transition/close/error branches and aggregate completion summary                           |
| Cron service        | `LC-05`            | `tests/server/noShowDetectionService.test.ts`           | Deadline gate, idempotent no-op with existing window, emergency fallback execution                 |
| Cron API boundary   | `LC-05`            | `tests/server/noShowDetectionCronApi.test.ts`           | Cron auth guard, deterministic success envelope, and internal-failure mapping                      |

Execution evidence: `pnpm test` passed (`12` files / `48` tests) on 2026-02-09.

## LC-06 automated test map

| Layer             | Capability mapping | Test/evidence artifact                           | Coverage focus                                                                                   |
| ----------------- | ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Auth policy logic | `LC-06`            | `tests/server/authAbuseHardening.test.ts`        | Allowlist enforcement, dev invite-code fallback, production mode defaults, and policy fallback   |
| Auth config       | `LC-06`            | `src/lib/server/auth-abuse-hardening.ts`         | Explicit Better Auth rate-limit rules and persistent database-backed storage selection           |
| Runtime signal    | `LC-06`            | `src/hooks.server.ts`                            | `auth_rate_limit_exceeded` warning signal for `/api/auth/sign-*` and reset abuse path `429` hits |
| Operations guide  | `LC-06`            | `documentation/launch/signup-abuse-hardening.md` | Approval workflow, threat model, mitigations, and monitoring playbook for launch                 |

Execution evidence: `pnpm test -- tests/server/authAbuseHardening.test.ts` passed on 2026-02-09.

## Maintenance rule

Update this file every time a `DRV-17l.*` child bead changes state.

Minimum update on each change:

1. Update `Latest status` and `Confidence` for affected capability IDs.
2. Add or replace evidence links in the evidence register.
3. Recalculate the launch confidence roll-up.
