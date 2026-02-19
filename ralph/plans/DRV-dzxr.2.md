# Audit (manager) routes/components for hardcoded UI strings

Task: DRV-dzxr.2

## Steps

1. Build the candidate list with a single documented scan command and save results to a tracked artifact path (for example `artifacts/i18n-manager-scan.json`), then triage with an explicit include/exclude rubric (include labels/placeholders/tooltips/aria/title/empty states/toasts; exclude logs/internal developer errors/IDs/URLs).
2. Define `(manager) route-reachable UI modules` as all non-test, non-storybook source files directly or transitively imported by files under `src/routes/(manager)`, including statically analyzable dynamic imports.
3. Replace each user-visible hardcoded string with the appropriate Paraglide message call (`m.xxx()`), preserving existing formatting and interpolation behavior.
4. Add any missing message keys needed by the `(manager)` scope to every locale configured in `project.inlang/settings.json` (`en`, `zh`, `zh-Hant`, `ko`) with placeholder/plural parity.
5. Regenerate Paraglide outputs with `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations` so new keys are available to the app code.
6. Run required validation (`pnpm check` and `pnpm test`), then re-run the same scan command from step 1 and require zero unresolved included items; document exclusions in task notes/PR with file path, literal string, and rationale.

## Acceptance Criteria

- `(manager)` routes and defined route-reachable UI modules have zero unresolved included user-facing hardcoded strings in the final scan report, and every exclusion is documented with file path, literal string, and justification.
- Any new message keys introduced for `(manager)` exist in every configured locale from `project.inlang/settings.json` (`en`, `zh`, `zh-Hant`, `ko`) with matching placeholders/plural semantics.
- Paraglide regeneration and project checks (`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations`, `pnpm check`, `pnpm test`) complete successfully.
