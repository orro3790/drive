# Add missing Paraglide message keys and translations

Task: DRV-dzxr.4

## Steps

1. Define and lock audit scope to `src/routes/(driver)/**`, `src/routes/(manager)/**`, and `src/routes/(app)/**` plus directly imported UI components changed by the prior i18n sweep.
2. Generate a deterministic list of referenced message keys in scope (from `m.<key>()` usages), compare against locale keys in `messages/en.json`, `messages/zh.json`, and `messages/zh-Hant.json`, and identify gaps.
3. Add missing keys to all three locale files with localized copy and enforce placeholder/parameter signature parity across locales for every new key.
4. Recompile Paraglide artifacts and run i18n/type checks to confirm no unresolved message keys or signature mismatches remain.
5. Open a PR with the fixes and enable auto-merge once required checks pass.

## Acceptance Criteria

- All newly referenced Paraglide message keys exist in `messages/en.json`, `messages/zh.json`, and `messages/zh-Hant.json`.
- No user-visible copy in the audited scope depends on missing Paraglide keys.
- Any new placeholders/parameters for added keys are signature-compatible across all three locale files.
- Paraglide compiles successfully and repository checks for the change pass.
