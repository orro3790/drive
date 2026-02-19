# Witness skip should not count as PASS

Task: DRV-qvg

## Steps

1. Inspect verdict aggregation and witness artifact gating in `scripts/nightly/orchestrator.ts` (and any helpers it calls) to identify where witness `{ passed: true, skipped: true }` is currently treated as an overall pass.
2. Update orchestrator verdict rules so a skipped witness result is never promoted to `passed` when required witness evidence is missing, and enforce explicit handling for missing `witness-ui-report.json`.
3. Update emitted orchestrator diagnostics/state payloads to preserve distinct witness states (`passed`, `failed`, `skipped`) plus reason codes/messages for skip/fail paths so triage remains actionable.
4. Add or update focused tests (orchestrator-level) for four scenarios: (a) missing witness script, (b) unreachable dev server, (c) normal witness pass, (d) normal witness fail; assert overall verdict, witness sub-verdict, and artifact requirements for each.
5. Add explicit assertions that missing `witness-ui-report.json` is surfaced as a distinct non-pass condition (not only implied by aggregate status), including diagnostics text/code checks.
6. Run validation with concrete commands and record results for handoff: `pnpm vitest tests/server/nightlyWitnessUiVerdict.test.ts` plus the orchestrator test file(s) touched in this task.

## Acceptance Criteria

- When witness is skipped due to missing script or unreachable dev server, overall orchestration cannot report PASS solely because skip was mapped to passed.
- `witness-ui-report.json` absence is surfaced as an explicit non-pass condition when witness evidence is required.
- Output diagnostics for this path remain actionable (clear scenario and reason), not a silent pass.

## AC Coverage Checklist

- AC1 -> Step 2 + Step 4 assertions for missing-script and unreachable-dev-server scenarios.
- AC2 -> Step 2 + Step 5 assertions for missing `witness-ui-report.json` as explicit non-pass condition.
- AC3 -> Step 3 + Step 5 assertions for diagnostics state/reason output.
