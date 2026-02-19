# Enforce CI quality-gate matrix for final landing

Task: DRV-lwg.3

## Steps

1. Baseline current protections with `gh api` (or repo settings if API access is restricted): record existing required status checks and define the target required matrix for `main` as `ci / lint`, `ci / typecheck`, `ci / unit`, `ci / e2e-smoke`, and `ci / build`.
2. Refactor `.github/workflows/ci.yml` so each required gate is a dedicated, stable-named job that runs on pull requests (and supports merge queue if configured), with optional/non-blocking jobs explicitly separated from required checks.
3. Verify job trigger behavior for normal PRs and path/condition edge cases so required checks are never skipped or left "Expected" due to filters/conditions.
4. Update branch protection or ruleset required checks to match the canonical CI job names; if direct mutation is not possible from CLI permissions, document exact required-check changes in the PR for maintainers to apply.
5. Prove enforcement with evidence: one intentionally failing PR run (showing merge blocked by required check) and one all-green run; attach links/screenshots/log references in the PR description.
6. Run local quality gates (`pnpm lint`, `pnpm check`, `pnpm test`, `pnpm test:e2e:smoke` where feasible, `pnpm build`) plus workflow lint/syntax validation before opening PR.

## Acceptance Criteria

- PR validation blocks merges on gate failures and quality checks run reliably in CI.
