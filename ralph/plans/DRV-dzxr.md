# Audit route i18n coverage

Task: DRV-dzxr

## Steps

1. Build a deterministic candidate list of potential hardcoded user-facing strings under `src/routes/(driver)`, `src/routes/(manager)`, and `src/routes/(app)` plus all route-reachable UI modules (components, stores, helpers, and toast builders).
2. Triage candidates with an explicit include/exclude rubric: include labels/placeholders/tooltips/aria/title/empty states/toasts; exclude logs/internal developer errors/IDs/URLs.
3. Replace hardcoded user-facing strings with existing or new `m.xxx()` calls, preferring key reuse when semantics match.
4. Add missing message keys to all configured locales from `project.inlang/settings.json` (currently `en`, `zh`, `zh-Hant`, and `ko`) with placeholder/plural parity across locales.
5. Regenerate Paraglide artifacts, then run required checks (`pnpm paraglide:compile`, `pnpm check`, and `pnpm test`) to validate references and typing.
6. Re-run the candidate scan and require zero unresolved items in scope, then record an audit checklist with scoped modules and any justified exclusions.

## Acceptance Criteria

- All driver-facing and manager-facing routes in `(driver)/`, `(manager)/`, and `(app)/` have no user-visible hardcoded strings.
- Missing Paraglide message calls are replaced with `m.xxx()` usage in routes and route-reachable UI modules.
- Required message keys exist for every configured locale in `project.inlang/settings.json` with matching placeholders/plural forms.
- Paraglide artifacts regenerate successfully and `pnpm check` plus `pnpm test` pass.
- A deterministic post-fix scan reports zero unresolved hardcoded user-facing strings in scope, with an audit checklist captured in the plan execution notes.
