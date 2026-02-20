# Audit driver routes/components for hardcoded UI strings

Task: DRV-dzxr.1

## Steps

1. Define audit scope as all files under `src/routes/(driver)/**` plus every Svelte/TS component transitively imported by those routes that renders driver-visible UI copy.
2. Run a deterministic literal-discovery pass (regex search + manual review) to enumerate candidate hardcoded user-visible strings, explicitly excluding non-translatable literals (brand name `Drive`, route paths, API fields, CSS class names, aria/test ids, and icon-only labels).
3. Convert each confirmed user-facing literal to `m.<key>()` using a consistent key naming scheme, preserving interpolation/plural behavior and existing UI state logic.
4. Add any missing keys to all supported locale files (`messages/en.json`, `messages/ko.json`, `messages/zh.json`, and `messages/zh-Hant.json`) with placeholder parity across locales, then recompile Paraglide artifacts.
5. Re-run the same literal-discovery checks to verify no remaining in-scope hardcoded copy, then run execute-flow verification gates before opening a PR with auto-merge enabled.

## Acceptance Criteria

- Audit evidence includes a before/after literal-discovery result for the defined scope and shows no remaining in-scope user-visible hardcoded strings.
- Every newly introduced `m.<key>()` reference has corresponding keys in all supported locale files (`messages/en.json`, `messages/ko.json`, `messages/zh.json`, and `messages/zh-Hant.json`) with matching placeholder signatures.
- Paraglide compilation succeeds and execute-flow quality gates (lint/typecheck/tests selected by the workflow) pass.
- Non-translatable literals (brand names, URLs, routes, identifiers) are intentionally left as literals and not converted.
