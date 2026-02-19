# Add nightly failure operational alerting

Task: DRV-e6p

## Steps

1. Lock a canonical nightly failure contract before coding: use the scheduled workflow job verdict plus required runtime artifacts as the source of truth, and define alert triggers as `(a) job.status != success` or `(b) required artifact contract violations` (missing runtime/vitest logs).
2. Implement a concrete alert sender for the nightly workflow that posts to the live ops channel via `NIGHTLY_ALERT_WEBHOOK_URL`, fires at most once per run for failed runs, and includes actionable payload fields (artifact date, workflow/run URL, commit SHA, failure reasons, artifact paths).
3. Add idempotency/dedupe for alert dispatch keyed by artifact date plus run identifier so retries/reruns do not page repeatedly; log when duplicate dispatch is suppressed.
4. Update the nightly runbook with alert owner, backup, escalation path, and the failure decision table used by automation.
5. Add automated coverage for alert decision and dispatch behavior, then run targeted tests/workflow checks and capture verification evidence for PR.

## Acceptance Criteria

- Nightly workflow defines an explicit operational alert step for failures.
- Runbook documents alert owner, backup/escalation path, and how responders should triage.
- Failure conditions (including missing/invalid required artifacts) trigger exactly one operational alert per nightly run, with duplicate suppression on retries/reruns.
