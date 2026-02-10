# DRV-ehh Audit - Schemas, Types, and Configuration

Date: 2026-02-10
Task: DRV-ehh

## Scope Verification

- Target scope validated: `src/lib/schemas/` (25 files) and `src/lib/config/` (4 files)
- Coverage target met: 29/29 files audited

## Severity Rubric

- Critical: production breakage or data/security corruption likely
- High: business-rule mismatch or user-facing behavior likely incorrect
- Medium: validation/design gap with meaningful reliability or maintainability risk
- Low: contract quality/consistency issues with lower immediate impact

## Findings Summary

- High: 2
- Medium: 4
- Low: 3

## Findings

### High

#### H1 - Confirmation reminder message conflicts with policy deadline

- Evidence:
  - `src/lib/config/dispatchPolicy.ts:15` sets `deadlineHoursBeforeShift: 48`
  - `src/lib/server/services/notifications.ts:111`-`src/lib/server/services/notifications.ts:112` says "needs confirmation within 24 hours"
- Impact: Drivers can be told the wrong confirmation window, increasing avoidable late confirmations and support noise.
- Recommendation: Generate this message from `dispatchPolicy.confirmation.deadlineHoursBeforeShift` (or inject computed deadline text) instead of hardcoding.

#### H2 - Health business-rule source mismatch (CLAUDE vs runtime policy)

- Evidence:
  - `CLAUDE.md:187` documents weighted scoring (attendance 50%, completion 30%, reliability 20%)
  - `src/lib/config/dispatchPolicy.ts:54`-`src/lib/config/dispatchPolicy.ts:63` defines additive event points, not weight buckets
  - `src/lib/server/services/health.ts:4`-`src/lib/server/services/health.ts:6` confirms additive point-based runtime logic
- Impact: Engineering and QA can validate against different "truths," increasing regression risk and incorrect product communication.
- Recommendation: Choose one canonical rule model; either update `CLAUDE.md` to match additive scoring or refactor runtime to the documented weighted model.

### Medium

#### M1 - `preferencesUpdateSchema` allows duplicate routes/days

- Evidence:
  - `src/lib/schemas/preferences.ts:29`-`src/lib/schemas/preferences.ts:30` enforces max length only (no uniqueness)
  - `src/lib/config/dispatchPolicy.ts:127`-`src/lib/config/dispatchPolicy.ts:129` uses top-N preference slicing, where duplicates reduce effective unique preferences
- Impact: Duplicate values can degrade preference quality and produce inconsistent scheduling/bidding behavior.
- Recommendation: Add uniqueness checks (e.g., `new Set(...)` via `.superRefine`) and optionally normalize/dedupe before persistence.

#### M2 - `shiftEditSchema` accepts empty payloads

- Evidence:
  - `src/lib/schemas/shift.ts:29`-`src/lib/schemas/shift.ts:32` makes all fields optional with no "at least one field" refine
- Impact: No-op edit requests are accepted, creating ambiguous API semantics and noisy audit trails.
- Recommendation: Add a refine guard requiring at least one editable field.

#### M3 - Manager alert customization is string-replace based, not placeholder-driven

- Evidence:
  - `src/lib/server/services/notifications.ts:99`-`src/lib/server/services/notifications.ts:108` template bodies are plain prose
  - `src/lib/server/services/notifications.ts:366`-`src/lib/server/services/notifications.ts:373` mutates body via `.replace('A route', ...)` and `.replace('A driver', ...)`
- Impact: Copy edits/localization can silently break runtime substitutions; placeholder correctness cannot be validated.
- Recommendation: Use explicit placeholders (for example `{routeName}`, `{driverName}`, `{date}`) and enforce token coverage with validation tests.

#### M4 - Lifecycle label coverage is incomplete for IA-specific lifecycle states

- Evidence:
  - `src/lib/config/driverLifecycleIa.ts:5`-`src/lib/config/driverLifecycleIa.ts:22` defines 9 assignment lifecycle states and 6 bid lifecycle states
  - `src/lib/config/lifecycleLabels.ts:18`-`src/lib/config/lifecycleLabels.ts:59` labels only coarse `AssignmentStatus` and `BidStatus`
  - `src/routes/(driver)/dashboard/+page.svelte:205`-`src/routes/(driver)/dashboard/+page.svelte:215` uses local state-to-step switching, indicating decentralized lifecycle presentation logic
- Impact: UI text/behavior for IA states can drift across surfaces because there is no centralized label map for those states.
- Recommendation: Add centralized labels keyed by `AssignmentLifecycleState`/`BidLifecycleState` and consume them in route surfaces.

### Low

#### L1 - Search/bounds filters are permissive strings instead of constrained enums

- Evidence:
  - `src/lib/schemas/academy-search.ts:14`-`src/lib/schemas/academy-search.ts:16`
  - `src/lib/schemas/academy-bounds.ts:37`-`src/lib/schemas/academy-bounds.ts:39`
- Impact: Invalid filter values pass validation and fail later as no-op/undefined query behavior.
- Recommendation: Constrain these fields with shared enums from source-of-truth status lists.

#### L2 - Some numeric response fields are weakly typed (`z.number`) where int/nonnegative is expected

- Evidence:
  - `src/lib/schemas/academy-close.ts:23` uses `count: z.number()`
  - `src/lib/schemas/academy-bounds.ts:78`-`src/lib/schemas/academy-bounds.ts:80` use unconstrained `count/page/limit`
- Impact: Contract validation is looser than intended and less defensive against malformed data.
- Recommendation: Tighten to `z.number().int().nonnegative()` (and `.min(1)` for page/limit where appropriate).

#### L3 - `NotificationType` is duplicated between API schema and service type union

- Evidence:
  - `src/lib/schemas/api/notifications.ts:7`-`src/lib/schemas/api/notifications.ts:31`
  - `src/lib/server/services/notifications.ts:32`-`src/lib/server/services/notifications.ts:51`
- Impact: Future additions/removals can drift between layers.
- Recommendation: Import a single shared `NotificationType` from schema/config instead of re-declaring in service code.

## Confirmed Alignments (No immediate issue)

- Assignment status and cancel reason enums align between schema and DB enum definitions.
- Notification enum values align between API schema and DB enum set.
- Dispatch policy values for shifts, confirmation windows, bidding weights, and flagging thresholds match documented rules in `CLAUDE.md` except the health scoring model mismatch noted in H2.

## Coverage Table (29/29)

| File                                   | Status  | Notes                                        |
| -------------------------------------- | ------- | -------------------------------------------- |
| `src/lib/schemas/academy-bounds.ts`    | Audited | L1, L2                                       |
| `src/lib/schemas/academy-close.ts`     | Audited | L2                                           |
| `src/lib/schemas/academy-search.ts`    | Audited | L1                                           |
| `src/lib/schemas/api/bidding.ts`       | Audited | No major gap found                           |
| `src/lib/schemas/api/notifications.ts` | Audited | L3 (duplication risk with service union)     |
| `src/lib/schemas/assignment.ts`        | Audited | No major gap found                           |
| `src/lib/schemas/call-log.ts`          | Audited | No major gap found                           |
| `src/lib/schemas/dashboard-metrics.ts` | Audited | No major gap found                           |
| `src/lib/schemas/driver.ts`            | Audited | No major gap found                           |
| `src/lib/schemas/fcm-token.ts`         | Audited | No major gap found                           |
| `src/lib/schemas/health.ts`            | Audited | Related to H2 documentation mismatch context |
| `src/lib/schemas/icon.ts`              | Audited | No major gap found                           |
| `src/lib/schemas/onboarding.ts`        | Audited | No major gap found                           |
| `src/lib/schemas/pipeline.ts`          | Audited | No major gap found                           |
| `src/lib/schemas/preferences.ts`       | Audited | M1                                           |
| `src/lib/schemas/queue.ts`             | Audited | No major gap found                           |
| `src/lib/schemas/route.ts`             | Audited | No major gap found                           |
| `src/lib/schemas/shift.ts`             | Audited | M2                                           |
| `src/lib/schemas/tooltip.ts`           | Audited | No major gap found                           |
| `src/lib/schemas/ui/breadcrumb.ts`     | Audited | No major gap found                           |
| `src/lib/schemas/ui/date.ts`           | Audited | No major gap found                           |
| `src/lib/schemas/ui/radio.ts`          | Audited | No major gap found                           |
| `src/lib/schemas/ui/select.ts`         | Audited | No major gap found                           |
| `src/lib/schemas/user-settings.ts`     | Audited | No major gap found                           |
| `src/lib/schemas/warehouse.ts`         | Audited | No major gap found                           |
| `src/lib/config/dispatchPolicy.ts`     | Audited | H1, H2, M1 cross-reference                   |
| `src/lib/config/driverLifecycleIa.ts`  | Audited | M4                                           |
| `src/lib/config/lifecycleLabels.ts`    | Audited | M4                                           |
| `src/lib/config/notificationTypes.ts`  | Audited | No major gap found                           |
