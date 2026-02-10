# DRV-965: Data Table System Production Readiness Audit

Date: 2026-02-10
Scope: `src/lib/components/data-table/` (all files, including `cells/` and `utils/`)

## Scope Summary

- Total files audited: 26
- Overall verdict: **Partial pass** (core architecture is solid, but there are accessibility and integration gaps that should be resolved before calling this area production-ready)
- Findings: 3 High, 5 Medium, 2 Low

## Requirement Matrix

| ID  | Requirement (from DRV-965)                              | Files reviewed                                                                                                                                         | Verdict                                    |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| R1  | TanStack integration (column defs, sorting, filtering)  | `createSvelteTable.svelte.ts`, `DataTable.svelte`, `DataTableHeader.svelte`, `DataTableBody.svelte`, `DataTableVirtualBody.svelte`, `columnHelpers.ts` | Partial (High finding H-3)                 |
| R2  | Pagination boundaries (first/last/empty/single-page)    | `DataTableFooter.svelte`, `DataTable.svelte`                                                                                                           | Pass                                       |
| R3  | Filter panel UX (range + dropdown together)             | `DataTableFilterPanel.svelte`, `DataTableFilterDropdown.svelte`, `DataTableFilterRange.svelte`, `types.ts`                                             | Partial (High finding H-2, Medium M-3/M-4) |
| R4  | Cell renderers (date/number/badge/null handling)        | `DataTableBody.svelte`, `DataTableVirtualBody.svelte`, `cells/*.svelte`                                                                                | Pass                                       |
| R5  | Export correctness                                      | `DataTableExportButton.svelte`, `utils/exportCsv.ts`, `DataTable.svelte`                                                                               | Partial (Medium M-1/M-2)                   |
| R6  | Performance for 100+ rows and re-renders                | `DataTableVirtualBody.svelte`, `DataTableBody.svelte`, `DataTable.svelte`                                                                              | Partial (Medium M-5)                       |
| R7  | Empty-state messaging                                   | `DataTableEmpty.svelte`, `DataTable.svelte`                                                                                                            | Pass (Low L-1 nuance)                      |
| R8  | Responsive behavior (scroll + mobile column behavior)   | `DataTable.svelte`, `DataTableFooter.svelte`, `DataTableHeader.svelte`, `DataTableMobileDetail.svelte`                                                 | Pass                                       |
| R9  | Accessibility (table semantics, sortable announcements) | `DataTableHeader.svelte`, `DataTableBody.svelte`, `DataTableVirtualBody.svelte`, filter/visibility menus                                               | Fail (High H-1/H-2, Low L-2)               |

## Fixtures and Method

The audit used deterministic fixture definitions to reason about behavior paths:

- `F_EMPTY`: 0 rows
- `F_SINGLE`: 1 row
- `F_MULTI`: 21 rows, page size 10
- `F_LARGE`: 150 rows, includes null/undefined/mixed value types

Method:

1. Static code-path review across all in-scope files.
2. Requirement-to-file traceability review.
3. Functional and non-functional risk analysis using fixture scenarios above.
4. Severity assignment by user impact + likelihood.

## Findings

### High

#### H-1: Sortable columns do not expose sort state announcements (`aria-sort`)

- Severity: High
- Evidence:
  - `src/lib/components/data-table/DataTableHeader.svelte:81`
  - `src/lib/components/data-table/DataTableHeader.svelte:417`
  - `src/lib/components/data-table/DataTableHeader.svelte:460`
- Impact: Screen-reader users get a generic "sort by" control but no reliable current state announcement (ascending/descending/none), which weakens table accessibility and auditability.
- Recommendation: Set `aria-sort` on sortable header cells based on current state (`none`, `ascending`, `descending`) and ensure changes are announced.

#### H-2: Invalid nested interactive controls in filter and column visibility menus

- Severity: High
- Evidence:
  - `src/lib/components/data-table/DataTableFilterDropdown.svelte:164`
  - `src/lib/components/data-table/DataTableFilterDropdown.svelte:171`
  - `src/lib/components/data-table/DataTableColumnVisibility.svelte:117`
  - `src/lib/components/data-table/DataTableColumnVisibility.svelte:129`
- Impact: `Checkbox` controls are rendered inside clickable `button` options. Nested interactive patterns are semantically invalid and can cause inconsistent keyboard/screen-reader behavior.
- Recommendation: Make each option a single control (either checkbox input with label OR button with non-interactive indicator), not both nested.

#### H-3: `columnDef.cell` non-primitive render output is dropped in body renderers

- Severity: High
- Evidence:
  - `src/lib/components/data-table/DataTableBody.svelte:356`
  - `src/lib/components/data-table/DataTableBody.svelte:361`
  - `src/lib/components/data-table/DataTableVirtualBody.svelte:409`
  - `src/lib/components/data-table/DataTableVirtualBody.svelte:413`
- Impact: TanStack column `cell` renderers that return non-string/non-number values are ignored and replaced with fallback text rendering, causing functional mismatches for rich cells.
- Recommendation: Render `columnDef.cell(...)` output directly (or via a supported adapter) instead of coercing to fallback for non-primitive return values.

### Medium

#### M-1: Export filename defaults to extensionless value in `DataTable`

- Severity: Medium
- Evidence:
  - `src/lib/components/data-table/DataTable.svelte:218`
  - `src/lib/components/data-table/DataTable.svelte:512`
  - `src/lib/components/data-table/utils/exportCsv.ts:83`
- Impact: Exported files can download without `.csv`, degrading UX and file-association behavior.
- Recommendation: Default `exportFilename` to `export.csv` (or append `.csv` when missing).

#### M-2: "Filtered" CSV export does not guarantee current visual sort order

- Severity: Medium
- Evidence:
  - `src/lib/components/data-table/utils/exportCsv.ts:38`
  - `src/lib/components/data-table/utils/exportCsv.ts:40`
- Impact: Users may expect filtered exports to match current table ordering; current implementation can diverge from visual state.
- Recommendation: For filtered export, use a sorted filtered row model path that matches displayed sort semantics.

#### M-3: Range filter accepts invalid/inverted bounds without guardrails

- Severity: Medium
- Evidence:
  - `src/lib/components/data-table/DataTableFilterRange.svelte:64`
  - `src/lib/components/data-table/DataTableFilterRange.svelte:65`
  - `src/lib/components/data-table/DataTableFilterRange.svelte:70`
- Impact: Invalid states (`min > max`, `NaN`) can silently produce confusing no-result outputs.
- Recommendation: Validate/sanitize bounds before applying; enforce `min <= max` and reject `NaN` inputs.

#### M-4: Declared filter types (`text`, `boolean`) are not implemented in filter panel UI

- Severity: Medium
- Evidence:
  - `src/lib/components/data-table/types.ts:34`
  - `src/lib/components/data-table/DataTableFilterPanel.svelte:146`
- Impact: Column metadata can declare filter modes that the UI does not render distinctly, leading to config/behavior drift.
- Recommendation: Add dedicated `text` and `boolean` filter controls (or remove unsupported types).

#### M-5: Virtualization assumes fixed row height and can drift for variable-height content

- Severity: Medium
- Evidence:
  - `src/lib/components/data-table/DataTableVirtualBody.svelte:65`
  - `src/lib/components/data-table/DataTableVirtualBody.svelte:170`
  - `src/lib/components/data-table/DataTableVirtualBody.svelte:181`
- Impact: With non-uniform row heights, spacer math and row positioning can become inaccurate.
- Recommendation: Either enforce fixed-height rows contractually or adopt measured/dynamic row virtualization.

### Low

#### L-1: Empty-state title/message fallback logic can hide expected helper text

- Severity: Low
- Evidence:
  - `src/lib/components/data-table/DataTableEmpty.svelte:35`
  - `src/lib/components/data-table/DataTableEmpty.svelte:45`
- Impact: If only a custom title is passed for empty state, default message is suppressed, which can reduce clarity.
- Recommendation: Consider preserving default empty message unless explicitly overridden.

#### L-2: Clickable rows use `role="button"` on `<tr>` in table context

- Severity: Low
- Evidence:
  - `src/lib/components/data-table/DataTableBody.svelte:237`
  - `src/lib/components/data-table/DataTableVirtualBody.svelte:289`
- Impact: Table semantics and interactive semantics can conflict for some assistive technologies.
- Recommendation: Move row interaction to inner controls or apply a pattern with clearer table/interactive role separation.

## Positive Observations

- `createSvelteTable` provides a strong Svelte 5 + TanStack bridge with explicit state sync and reactivity tracking.
- Empty/loading/error states are consistently wired through `DataTableEmpty` and `DataTable`.
- Core responsive behavior is thoughtfully handled (`overflow-x` table container, mobile detail sheet, stacked chrome behavior).
- Pagination controls correctly gate first/previous/next/last actions based on table capability flags.

## Coverage Appendix (All Audited Files)

- [x] `src/lib/components/data-table/DataTable.svelte`
- [x] `src/lib/components/data-table/DataTableHeader.svelte`
- [x] `src/lib/components/data-table/DataTableBody.svelte`
- [x] `src/lib/components/data-table/DataTableVirtualBody.svelte`
- [x] `src/lib/components/data-table/DataTableFooter.svelte`
- [x] `src/lib/components/data-table/DataTablePagination.svelte`
- [x] `src/lib/components/data-table/DataTableEmpty.svelte`
- [x] `src/lib/components/data-table/DataTableColumnVisibility.svelte`
- [x] `src/lib/components/data-table/DataTableExportButton.svelte`
- [x] `src/lib/components/data-table/DataTableFilterPanel.svelte`
- [x] `src/lib/components/data-table/DataTableFilterDropdown.svelte`
- [x] `src/lib/components/data-table/DataTableFilterRange.svelte`
- [x] `src/lib/components/data-table/DataTableMobileDetail.svelte`
- [x] `src/lib/components/data-table/createSvelteTable.svelte.ts`
- [x] `src/lib/components/data-table/persistTableState.ts`
- [x] `src/lib/components/data-table/columnHelpers.ts`
- [x] `src/lib/components/data-table/types.ts`
- [x] `src/lib/components/data-table/index.ts`
- [x] `src/lib/components/data-table/utils/exportCsv.ts`
- [x] `src/lib/components/data-table/utils/persistState.ts`
- [x] `src/lib/components/data-table/cells/CellText.svelte`
- [x] `src/lib/components/data-table/cells/CellNumber.svelte`
- [x] `src/lib/components/data-table/cells/CellDate.svelte`
- [x] `src/lib/components/data-table/cells/CellRatio.svelte`
- [x] `src/lib/components/data-table/cells/CellBadge.svelte`
- [x] `src/lib/components/data-table/cells/CellActions.svelte`
