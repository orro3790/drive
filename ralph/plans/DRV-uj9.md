# Audit primitive and app-shell components

Task: DRV-uj9

## Steps

1. Inventory all target components in `src/lib/components/primitives/` and `src/lib/components/app-shell/`, reconcile the bead's "12 primitives + 4 app-shell" baseline against the current repo, and freeze a canonical scope list/count in the report header before auditing.
2. Audit every inventoried primitive component using a required matrix row set: accessibility (ARIA, keyboard, focus, screen reader), prop typing/contracts, design-token usage, hardcoded values, theme behavior, and state handling (default/disabled/loading/empty/long-text).
3. Audit every inventoried app-shell component using the same matrix, plus app-shell-specific checks for navigation semantics, active-state behavior, and responsive layout behavior at 390px.
4. Run cross-cutting consistency checks across all inventoried components for event handling parity (click and keyboard), token adherence to `app.css` custom properties, and shared edge-case behavior.
5. Enforce a completion gate that 100% of scoped components have severity-rated evidence, then write prioritized findings to `logs/nightly/2026-02-10/audit-components-primitives.md`.

## Acceptance Criteria

- Production-readiness audit covers all components in `src/lib/components/primitives/` and `src/lib/components/app-shell/`.
- Findings explicitly evaluate accessibility (ARIA, keyboard navigation, focus management, screen reader behavior), prop typing completeness, and event-handling correctness.
- Findings include design token usage checks, hardcoded value/style detection, mobile responsiveness at 390px, and dark/light theme support.
- Findings include edge-case coverage (empty content, long text, disabled/loading states) and consistency checks across similar components.
- Results are written to `logs/nightly/2026-02-10/audit-components-primitives.md` with severity ratings.
