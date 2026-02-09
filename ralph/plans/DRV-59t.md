# Audit for dead code and unused exports

Task: DRV-59t

## Steps

1. Build an export/import inventory across the whole repository (`src/`, `tests/`, `scripts/`, and build/config files) to identify exported symbols with no inbound usage and files that appear orphaned from the application graph.
2. Scan `src/` for unreachable code and stale artifacts, including dead branches, commented-out code blocks, `console.log` calls, `TODO` markers, and debug flags left behind.
3. Review `src/lib/stores/*.svelte.ts` for properties written but never read, and verify likely dead state fields against component and API usage.
4. Cross-check schema and API surface usage to find fields defined but not consumed by routes/components, inspect Svelte component styles for likely unused CSS classes, and account for dynamic usage patterns (`import()`, string-based lookups, framework-convention entry points).
5. Validate potential false positives with evidence, confidence level, and at least one verification check (typecheck/tests/build or targeted runtime trace) before marking items safe-to-remove; then write prioritized findings with severity ratings to `logs/nightly/<YYYY-MM-DD>/audit-dead-code.md` using the execution date directory.

## Acceptance Criteria

- `logs/nightly/<YYYY-MM-DD>/audit-dead-code.md` exists using the execution date directory.
- Audit identifies unused exports, orphaned files, and unreachable/dead branches where present.
- Audit usage checks include whole-repo references outside `src/` and account for dynamic/framework-based access patterns.
- Audit covers unused store properties, unused schema fields, and likely unused CSS classes.
- Audit flags leftover dev artifacts (commented-out code, `console.log`, `TODO`, debug flags).
- Findings include severity ratings, confidence levels, evidence, and safe-to-remove recommendations backed by verification checks.
