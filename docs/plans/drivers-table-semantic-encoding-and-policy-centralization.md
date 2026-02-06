# Drivers Table Semantic Encoding + Policy Centralization

Task: Redesign `/drivers` semantic encoding and centralize algorithm constants.

## Goals

1. Replace the old non-semantic encoding with policy-aligned visual encoding.
2. Centralize all algorithm constants in one source of truth.
3. Reuse Snapgrade-style variance-bar UX for Avg Parcels vs cohort baseline.
4. Add column-header tooltips that explain formulas and thresholds.
5. Keep the current table-resize stability fix intact.

## Product Decisions (Locked)

1. Replace `Flag Status` with a richer `Health` column (single source of status truth).
2. Use warehouse cohort for Avg Parcels comparison baseline.
3. Use explicit header tooltips for policy explanation.
4. Keep precision text values in cells; use bars/colors as secondary encoding.

## Central Policy Module

Create `src/lib/config/dispatchPolicy.ts` and move algorithm constants there.

### Proposed structure

```ts
export const dispatchPolicy = {
	timezone: {
		toronto: 'America/Toronto'
	},
	shifts: {
		startHourLocal: 7,
		arrivalDeadlineHourLocal: 9,
		completionEditWindowHours: 1
	},
	scheduling: {
		weekLengthDays: 7
	},
	confirmation: {
		windowDaysBeforeShift: 7,
		deadlineHoursBeforeShift: 48,
		reminderLeadDays: 3,
		deploymentDate: '2026-03-01'
	},
	bidding: {
		instantModeCutoffHours: 24,
		emergencyBonusPercent: 20,
		familiarityNormalizationCap: 20,
		preferenceTopN: 3,
		scoreWeights: {
			completionRate: 0.4,
			routeFamiliarity: 0.3,
			attendanceRate: 0.2,
			routePreferenceBonus: 0.1
		}
	},
	flagging: {
		attendanceThresholds: {
			earlyShiftCount: 10,
			beforeEarlyShiftCount: 0.8,
			atOrAfterEarlyShiftCount: 0.7
		},
		gracePeriodDays: 7,
		reward: {
			minShifts: 20,
			minAttendanceRate: 0.95
		},
		weeklyCap: {
			base: 4,
			reward: 6,
			min: 1
		},
		ui: {
			watchBandAboveThreshold: 0.05
		}
	},
	jobs: {
		notificationBatchSize: 10,
		performanceCheckBatchSize: 50
	}
} as const;
```

### Helper exports

- `getAttendanceThreshold(totalShifts: number): number`
- `isRewardEligible(totalShifts: number, attendanceRate: number): boolean`
- `calculateBidScoreParts(...)` (optional pure helper used by bidding service)

## Refactor Targets (Constants Migration)

Update these files to consume `dispatchPolicy`:

- `src/lib/server/services/flagging.ts`
- `src/lib/server/services/bidding.ts`
- `src/lib/server/services/confirmations.ts`
- `src/lib/server/services/noshow.ts`
- `src/routes/api/bids/+server.ts`
- `src/routes/api/shifts/arrive/+server.ts`
- `src/routes/api/shifts/complete/+server.ts`
- `src/routes/api/assignments/[id]/emergency-reopen/+server.ts`
- `src/routes/api/cron/auto-drop-unconfirmed/+server.ts`
- `src/routes/api/cron/send-confirmation-reminders/+server.ts`
- `src/routes/api/cron/performance-check/+server.ts`

## Drivers API Enrichment (Warehouse Cohort)

Update `src/routes/api/drivers/+server.ts` to return cohort-aware fields.

### Add per-driver derived fields

- `primaryWarehouseId: string | null`
- `primaryWarehouseName: string | null`
- `warehouseCohortAvgParcels: number | null`
- `avgParcelsDeltaVsCohort: number | null`
- `attendanceThreshold: number`
- `healthState: 'flagged' | 'at_risk' | 'watch' | 'healthy' | 'high_performer'`

### Cohort strategy

1. Determine each driver's primary warehouse from historical completed shifts (max count).
2. Compute average `avgParcelsDelivered` for drivers in that warehouse cohort.
3. If no cohort can be inferred, use `null` (UI renders a neutral fallback, not fake precision).

## Schema + Store Updates

- Extend `src/lib/schemas/driver.ts` for the new fields.
- Ensure `src/lib/stores/driverStore.svelte.ts` parses and keeps those fields.

## Drivers Table Redesign

Update `src/routes/(manager)/drivers/+page.svelte`.

### Column model

- Keep identity columns (`Name`, `Email`, `Phone`).
- Replace `Flag Status` with `Health`.
- Keep `Attendance`, `Completion`, `Avg Parcels Delivered`, `Weekly Cap`.

### Encodings

1. **Health**
   - Dot/chip + concise label from `healthState`.
   - Severity color is exclusive to health semantics.

2. **Attendance**
   - Text percentage + progress bar.
   - Threshold marker derived from `attendanceThreshold`.
   - Optional subtle warning treatment when under threshold.

3. **Completion**
   - Text percentage + neutral magnitude bar.
   - No policy-danger colors unless tied to an explicit policy rule.

4. **Avg Parcels Delivered**
   - Snapgrade-style variance bar:
     - fill = driver value magnitude
     - marker = warehouse cohort average
   - Add delta text (`+X` / `-X`) vs cohort.

5. **Weekly Cap**
   - Compact capacity glyphs (e.g., filled dots) + numeric fallback.

## Header Tooltips

Use `DataTable` `headers` snippets and `Tooltip` for explanatory headers:

- Attendance: dynamic threshold rule (80% before 10 shifts, 70% after).
- Completion: definition used in scoring context.
- Avg Parcels: warehouse cohort comparison definition.
- Health: precedence/logic overview.

Add message keys in `messages/en.json` (and mirrored keys in `messages/zh.json`).

## Snapgrade Pattern Reuse

Reference design and interaction from:

- `C:\Users\matto\projects\Snapgrade\src\lib\modules\gradesheets\components\VarianceBar.svelte`

Adaptation notes:

- Keep compact table row density suitable for manager grid.
- Remove grading-specific concepts (passing score) and use neutral/categorical semantics.

## Implementation Order

1. Add `dispatchPolicy.ts` and helper exports.
2. Migrate server constants usage.
3. Enrich `/api/drivers` response with cohort + health-derived fields.
4. Update `driver.ts` schema and store typing.
5. Implement Drivers table cell components/snippets and header tooltips.
6. Add i18n keys.
7. Verify behavior and run checks.

## Verification Checklist

1. `pnpm check` passes.
2. `/drivers` table renders and resizes correctly (especially around Avg Parcels boundary).
3. Sorting works with encoded columns (Attendance, Completion, Avg Parcels, Health).
4. Tooltip copy appears and is keyboard accessible.
5. Cohort bar renders neutral fallback for drivers without cohort data.
6. No regression in bidding/flagging/confirmation/no-show behavior after constants migration.

## Non-goals

- No changes to scoring business rules themselves (only centralization + consistency).
- No redesign of unrelated manager tables.
