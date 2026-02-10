---
name: vitest
description: Applies Vitest testing discipline and anti-test-massaging guardrails. Use when writing, fixing, configuring, or reviewing tests (including mocks, snapshots, and coverage). Triggers: test, tests, vitest, failing test, mock, snapshot, coverage.
---

# Vitest Testing Discipline

This skill exists to prevent "massage tests until green" behavior.

Tests are evidence, not obstacles.

## Core Principles

- Keep instructions concise and task-focused; avoid re-explaining basics.
- Provide one default path first; add alternatives only when they are truly needed.
- Preserve clear skill discovery by stating both what this skill does and when to use it.

## When to Use

- Any task that writes, edits, or removes tests
- Any task where a test is failing and root cause is unknown
- Any task that changes behavior covered by tests
- Any task that touches `vitest.config.*`, test harnesses, or mocks

## Non-Negotiable Rules

1. **Do not weaken assertions to make a failing test pass** unless the requirement changed.
2. **Assume failing tests may indicate real product bugs** until disproven.
3. **If expected behavior changes, cite the requirement source** (spec, bead acceptance criteria, API contract).
4. **No blind snapshot updates** (`-u`) without reviewing and explaining the diff.
5. **Never leave debug artifacts** (`.only`, accidental `.skip`, temporary console noise).

## Decision Framework: Source vs Test Fix

When a test fails, decide explicitly:

- **Fix source code** when implementation violates current behavior contract.
- **Fix test code** when test setup/assertion is incorrect, flaky, or asserting behavior never promised.
- **Fix both** when contract changed and implementation plus tests must move together.

If making a **test-only** change, document why it is not hiding a product defect.

## Execution Workflow

1. **Pin the contract first**
   - Identify expected behavior from acceptance criteria/spec/API docs.
2. **Reproduce with focused run**
   - Prefer narrow command first (single file/suite), then widen scope.
3. **Diagnose root cause**
   - Determine if failure is implementation, test harness, or contract drift.
4. **Apply minimal correct fix**
   - Prefer production fix over assertion weakening when behavior is wrong.
5. **Prove it**
   - Re-run focused tests, then related suite, then broader gate as needed.
6. **Report transparently**
   - Separate "source changes" from "test changes" in final handoff.

## Vitest Guardrails (Doc-Informed)

### Mock and State Hygiene

- Clear or restore mocks between tests (`mockClear`/`mockReset`/`mockRestore`).
- `vi.setSystemTime`, `vi.stubGlobal`, and env stubs are not auto-reset by default.
  - Reset with `vi.useRealTimers`, `vi.unstubAllGlobals`, `vi.unstubAllEnvs`, or enable config flags.

### Hoisting and Module Mocks

- `vi.mock` is hoisted.
- Use `vi.doMock` when you need non-hoisted behavior tied to runtime variables.
- For Browser Mode module export spying limitations, use `vi.mock(path, { spy: true })`.

### Async and Flake Control

- Use `vi.waitFor` or `expect.poll` for async eventual consistency.
- `expect.poll` must be awaited and does not support snapshot/resolves/rejects/toThrow matchers.
- Favor deterministic time and explicit waits over arbitrary sleep.

### Snapshot Discipline

- Snapshot artifacts must be reviewed as code.
- Update snapshots only when behavior change is intentional and explained.
- In concurrent async snapshot tests, use local context `expect`.

### Concurrency and Isolation

- By default, files run isolated and in parallel.
- Treat `test.concurrent` as opt-in and only when tests are state-independent.
- If isolation/parallelism is changed for speed, document risk tradeoff.

### Assertion Precision

- Prefer precise matchers over broad truthy checks.
- Use `toEqual` for structural equality, `toBe` for identity/primitives.
- Use `toBeCloseTo` for floating-point comparisons.
- Use `toThrow`/`toThrowError` for exception contracts.

## Project-Specific Conventions

- Use Vitest as the test runner (`pnpm test`).
- Place tests under `tests/` using `{name}.test.ts`.
- No `any` in tests; use `unknown` plus narrowing/type guards.
- Prioritize tests for services, utilities, and store actions.
- Avoid testing presentational primitives or third-party internals.

## Required Handoff Format for Test Work

When finishing test-related tasks, always include:

1. **Behavior contract used** (what truth was enforced)
2. **Source fixes** (if any)
3. **Test fixes/additions** (and why they are legitimate)
4. **Commands run**
5. **Residual risk or follow-up**

## Reference URLs (Vitest)

- https://vitest.dev/guide/mocking.html
- https://vitest.dev/api/vi.html
- https://vitest.dev/api/mock.html
- https://vitest.dev/guide/snapshot.html
- https://vitest.dev/guide/parallelism.html
- https://vitest.dev/guide/improving-performance.html
- https://vitest.dev/guide/common-errors.html
- https://vitest.dev/api/expect.html
