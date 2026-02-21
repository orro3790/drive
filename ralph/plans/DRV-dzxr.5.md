# Regenerate Paraglide artifacts and verify i18n coverage

Task: DRV-dzxr.5

## Steps

1. Verify prerequisite beads (`DRV-dzxr.1` through `DRV-dzxr.4`) are closed and their i18n/key updates are present on `origin/main`.
2. Sync the active task branch with the latest `origin/main` so artifact regeneration runs on the merged audit changes.
3. Regenerate Paraglide artifacts (`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations`) and resolve any missing-key or typing errors.
4. Validate locale completeness for every configured locale in `project.inlang/settings.json` (`en`, `zh`, `zh-Hant`, `ko`) so each new key exists with placeholder/plural parity.
5. Run `pnpm check` and `pnpm test` to validate i18n references and type safety after regeneration.
6. Run a deterministic hardcoded-string verification pass over `src/routes/(driver)`, `src/routes/(manager)`, `src/routes/(app)`, and route-reachable UI modules; require zero unresolved user-facing hardcoded strings and record justified exclusions.
7. Capture verification evidence in the task notes/PR description (regeneration output, locale validation result, and hardcoded-string scan summary).

## Acceptance Criteria

- Paraglide artifacts regenerate successfully (`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide --emit-ts-declarations`) with no missing-key or typing errors.
- `pnpm check` and `pnpm test` pass after regeneration.
- Every key touched by the audit exists across all configured locales (`en`, `zh`, `zh-Hant`, `ko`) with matching placeholders/plural forms.
- `(driver)`, `(manager)`, and `(app)` route scopes (plus route-reachable UI modules) have zero unresolved user-facing hardcoded strings after verification.
