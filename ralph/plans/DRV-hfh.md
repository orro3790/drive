# nightly: display shift start time in UI + notifications

Task: DRV-hfh

## Steps

1. Audit all required UI surfaces (`/schedule`, `/dashboard`, `/bids`) plus shift-related notification rendering/message builders, and produce a checklist marking each surface/path as already compliant or requiring changes.
2. Update every non-compliant required UI surface to show assignment date + route start time together, using shared formatting helpers to enforce 12-hour output with minutes.
3. Update shift-related notification payload and message builders so in-app and push content always include shift date/time context; where upstream fields are missing, implement deterministic fallback behavior (for example, date-only or time-only wording) and ensure metadata is still persisted consistently.
4. Add/adjust tests to explicitly cover each required UI surface and each modified notification path, including formatting assertions that enforce 12h-with-minutes output and fallback behavior.
5. Run validation and execute an explicit verification matrix that checks the three UI surfaces and shift-related notifications (in-app + push) against acceptance criteria before preparing PR notes for DRV-hfh.

## Acceptance Criteria

- Drivers can see shift start time on their schedule/dashboard/bids.
- Shift-related notifications include shift date/time context.
- Formatting is consistent (12h with minutes).
