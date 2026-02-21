# Audit (app) routes/components for hardcoded UI strings

Task: DRV-dzxr.3

## Steps

1. Build a deterministic candidate list of potential hardcoded user-facing strings in `src/routes/(app)` and route-reachable UI modules, then triage with an explicit include/exclude rubric (include labels/placeholders/tooltips/aria/title/empty states/toasts; exclude logs/internal developer errors/IDs/URLs).
2. Replace each user-visible hardcoded string with the appropriate Paraglide message call (`m.xxx()`), preserving existing formatting and interpolation behavior.
3. Add any missing message keys needed by the `(app)` scope to every locale configured in `project.inlang/settings.json` (currently `en`, `zh`, `zh-Hant`, `ko`) with placeholder/plural parity.
4. Regenerate Paraglide outputs with `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations` so new keys are available to the app code.
5. Run required validation (`pnpm check` and `pnpm test`) after regeneration.
6. Re-run the same deterministic hardcoded-string scan for `(app)` scope, require zero unresolved user-facing items, and capture an audit checklist with justified exclusions in task notes/PR.

## Acceptance Criteria

- A deterministic post-fix scan for `(app)` routes and route-reachable UI modules reports zero unresolved user-facing hardcoded strings, with justified exclusions documented in an audit checklist.
- Any new message keys introduced for `(app)` exist in every configured locale from `project.inlang/settings.json` (currently `en`, `zh`, `zh-Hant`, `ko`) with matching placeholders/plural semantics.
- Paraglide regeneration (`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations`) and project checks complete successfully after the `(app)` audit changes.
