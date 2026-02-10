# Testing Standards (Legacy)

Status: LEGACY (copied from a previous project). Drive does not currently use this testing setup (Vitest/Firestore/GCS) in this repo. Keep for reference only and update before relying on it.

## 1. Test Runner & Layout

- Runner: Vitest
- Environment: jsdom
- Single test folder: `tests/`
- Global setup: `tests/setup.ts`
- Discovery: `tests/**/*.test.{js,ts}`

## 2. What to Test

### Naming Convention

- Use exactly one suffix: `{name}.test.ts` (or `.test.js`).
- Avoid additional dots in the base filename. Prefer path folders or hyphens for multi-part names.
  - Good: `tests/unit/components/FilterBar/labels.test.ts`
  - Good: `tests/unit/stores/students/studentsStore.test.ts`
  - Avoid: `FilterBar.labels.test.ts`, `studentsStore.test.ts`

### Test These:

- **Core utilities**: tokenization, offsets, sentence segmentation, language detection
- **Business logic/services**: error classification integration, prompt builders, alias mapping
- **Smart Store actions**: optimistic updates, revert-on-failure, state mutations
- **Boundary rules**: no punctuation‑only sentences; marker enforcement; locale selection
- **Integration tests**: Real feature workflows that exercise multiple components together

### Do NOT Test These:

- **UI primitives** (Button, Icon, Badge, etc.) - Test these only through integration tests in real features
- **Svelte components with snippet props** - Unit testing requires type assertions; prefer integration tests
- **Pure presentational components** - Components that only arrange CSS/layout without logic
- **HTML/Browser spec compliance** - Don't test that `disabled` buttons are unfocusable (browser guarantees this)
- **Third-party library behavior** - Trust that SvelteKit routing works, Zod validates, etc.

### Integration Over Isolation

Prefer integration tests for Svelte components. Instead of unit testing a Button component:

- Test "Create Template button opens modal and saves new template"
- Test "Delete Student button shows confirmation and removes student"
- Avoid testing "Button applies primary variant class"

Integration tests provide better coverage with less maintenance and avoid Svelte 5 snippet complications.

## 3. Test Style

- Use deterministic inputs; avoid time/network randomness
- Prefer small, focused tests; one behavior per it()
- Use meaningful, readable names and inputs
- Avoid brittle positional assumptions (e.g., search tokens rather than fixed indices)

## 4. Setup & Running

- Setup file: `tests/setup.ts`
  - Extends expect() with @testing-library/jest-dom matchers via `@testing-library/jest-dom/vitest`
- Commands (PowerShell):
  - `npm run test` — all tests
  - `npm run test:watch` — watch mode
  - `npm run test:coverage` — coverage
- Single file: `npx vitest tests\utils\textUtils.test.ts`
  - Staging E2E: `npm run test:staging` — runs tests with `STAGING_E2E=1` enabled (see below)

### 4.1 Staging E2E Mode (STAGING_E2E)

- Purpose: Exercise real Firebase services (Firestore/Storage) against the staging project using self‑seeded fixtures and self‑cleanup to avoid data pollution.
- How to run:
  - Prefer the script: `npm run test:staging` (defined as `cross-env STAGING_E2E=1 vitest run`)
  - Alternatively (PowerShell): `$env:STAGING_E2E = "1"; vitest run`
- Required environment (staging):
  - `FIREBASE_PROJECT_ID` — staging project id
  - `GOOGLE_APPLICATION_CREDENTIALS` — absolute path to a service account JSON
  - `GCS_STORAGE_BUCKET` — unified storage bucket (e.g., `drive-stg-storage`)
- Test architecture:
  - Each test run generates a unique `runId` (e.g., `e2e_<uuid>`) and stores all data under namespaced paths/ids: Firestore docs include `runId`, GCS objects use `test/<runId>/...`
  - Tests must self‑seed required data and GCS objects at the start, and self‑clean at the end (delete by `runId`/prefix)
  - Tests are rerunnable and isolated (no shared state); no manual seeding is required
  - Storage cleanup is “best effort”: seed under `test/<runId>/...` and delete by prefix; leftover objects should be rare and can be purged safely by prefix if a test aborts mid‑run
  - Guard tests so they only execute when `process.env.STAGING_E2E === '1'`; otherwise, they should skip to prevent accidental writes in local/integration runs

## 5. Patterns & Anti‑Patterns

### 5.1 STRICT: No `any` Types

- **NEVER use `any` in test files.** This is a hard rule.
  - **Why**: `any` disables type checking, hides bugs, and defeats the purpose of TypeScript.
  - **Alternative 1 (Unknowns)**: Use `unknown` and narrow it with type guards.
  - **Alternative 2 (Mocks)**: Define minimal interfaces for mock chains (see §11).
  - **Alternative 3 (Fixtures)**: Use Zod schema types (e.g., `z.infer<typeof schema>`) or partials `Partial<T>`.
- **Refuse to generate `any`**: If you are tempted to use `any`, stop and define the correct type.

### 5.2 General Patterns

- Do: keep tests independent; avoid sharing mutable state
- Do: test edges listed in implementation plans
- Don't: add console logging; tests should fail clearly
- Don't: rely on private APIs or unstable internals
- Don't: use `any` type (see above).

## 6. Svelte 5 Runes in Tests

- Configure Vitest to resolve browser entries during tests (already in `vite.config.ts`):
  - `resolve.conditions = ['browser']` when `process.env.VITEST` is set
- Async reactivity:
  - Prefer `await Promise.resolve()` for a single microtask when waiting for async preflight or queued microtasks
  - Use `flushSync` from `svelte` when asserting after `$effect`-driven updates
- Avoid arbitrary `setTimeout` sleeps. Use targeted microtasks or `flushSync`
- See Mocking Policy for mocking rules.

### Vitest-idiomatic waiting (DOM/reactivity)

- Prefer `await expect.poll(() => querySomething()).toBeTruthy()` for assertions that eventually become true (DOM nodes, values).
- Use `await vi.waitFor(() => { /* stop throwing when ready */ })` to obtain a stable value/condition, then assert.
- Use `flushSync` only to synchronously run pending Svelte `$effect`s immediately after an interaction or mount; do not rely on it to wait for eventual UI.
- Avoid `tick()` in tests; it advances microtasks but does not guarantee DOM/observer settling.
- For debounce/throttle flows, use `vi.useFakeTimers()` and `vi.advanceTimersByTime(ms)`.

Examples:

```ts
// expect.poll — retries the assertion until it passes within timeout
await expect.poll(() => screen.queryByRole('button', { name: /show path/i })).not.toBeNull();

// vi.waitFor — wait until callback stops throwing, then assert
const btn = await vi.waitFor(() => {
	const el = screen.queryByRole('button', { name: /show path/i });
	if (!el) throw new Error('not ready');
	return el;
});
expect(btn).toBeTruthy();
```

## 7. Test Validity: Are We Testing Behavior or Just Passing?

When fixing failing tests, ensure you're still validating real behavior, not just making tests pass.

### Validation Techniques

1. **Mutation Testing** - Break the implementation deliberately:
   - Comment out the behavior being tested
   - Test should FAIL if it's actually validating that behavior
   - Example: Comment out revert logic in optimistic update → revert test should fail

2. **Review Assertions** - Check what's actually being tested:

- Good: `expect(store.templates.find(t => t.id === 'A')).toBeUndefined()`
- Bad: `expect(mockFn).toHaveBeenCalled()` (tests mock, not behavior)

3. **Test the Test** - Inversion technique:
   - A good test fails when implementation is wrong
   - A good test passes when implementation is correct
   - If test passes with broken code, the test is meaningless

### Red Flags (Test Smells)

- Assertions that check test setup, not observable behavior
- Mocks that define expected results (circular validation)
- Tests that pass even when core logic is commented out
- `waitUntil()` conditions that are always true

### Green Flags (Valid Tests)

- Tests fail when implementation is broken
- Assertions check behavior from user/component perspective
- Mocks simulate external systems only (fetch, DB), not internal logic
- Test structure mirrors actual usage flow

### When Refactoring Tests

Ask yourself: **"Did I change ANY assertions?"**

- If NO: Likely still valid (improved test infrastructure)
- If YES: Verify you're still testing the same behavior

Common valid changes:

- Setup methods (seeding data, mocking external systems)
- Timing/synchronization (`waitUntil`, `Promise.resolve()`)
- Test utilities (`testReset`, `testSeed*`)

Common invalid changes:

- Weakening assertions to make tests pass
- Adding conditions that skip the real check
- Mocking internal logic instead of fixing the test

### When Implementation Legitimately Changed

Sometimes tests fail because the **implementation correctly changed behavior**. This is different from "tweaking tests to pass."

**How to distinguish:**

| Scenario                                                             | Action                                              |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Test expects old behavior, implementation has new (correct) behavior | Update test to expect new behavior                  |
| Test setup uses outdated schema/model                                | Update test fixtures to match current schema        |
| Test expects error that implementation no longer throws              | Verify the change was intentional, then update test |
| Test passes but implementation is broken                             | Fix implementation, not test                        |

**Example: deleteLesson now prevents deletion with attendance records**

```ts
// OLD test expectation (before implementation change):
expect(deleteLesson('lesson-1')).resolves.toBeUndefined();

// NEW test expectation (after intentional behavior change):
await expect(deleteLesson('lesson-1')).rejects.toThrow(
	'Cannot delete lesson with attendance records. Use cancelLesson instead.'
);
```

This is a **valid test update** because:

1. The implementation change was intentional (data protection)
2. The new test validates the new (correct) behavior
3. The test would fail if someone accidentally removed the guard

## 8. CI Expectations

- PRs should include or update tests when changing logic
- All tests must pass; coverage reports should be reviewed for core changes

## 9. References

- Code Review Standards: `documentation/agent-guidelines/code-review-standards.md`
- Logging: `documentation/agent-guidelines/logging-strategy.md`
- Svelte 5 patterns: `documentation/agent-guidelines/svelte5-patterns.md`
- Vitest docs (via ragnet): consult Svelte “Testing” (Vitest setup) and Vitest browser guides before altering test config; use ragnet to search and cite the pages in PRs.

## 10. Test Design Workflow (Feature-first, Behavior-driven)

- Define behaviors before coding (Given/When/Then). Link each behavior to one or more tests.
- Derive tests from implementation plans and acceptance criteria in `documentation/plans/`.
- Prioritize what breaks user value first:
  - Utilities with invariants (e.g., normalization, parsing)
  - Services hitting persistence/boundaries (Firestore, HTTP)
  - Smart Store actions (optimistic updates, revert-on-failure)
  - Cross-cutting constraints (auth scoping, trial gating, error handling)
- Write tests that prove the failure modes:
  - Invalid inputs (Zod rejections) and permission denials
  - Boundary values (empty, large, special chars, diacritics)
  - Race/ordering risks (AbortController, concurrent calls)
- Use "one behavior per it()" with meaningful names. Avoid asserting implementation details; assert observable behavior and public contracts.

### 10.1 Service Contracts (Contracts-First Approach)

For services with complex business logic, define behavioral contracts BEFORE writing tests. This prevents "teaching to the test" where tests are repeatedly modified to pass rather than validate real behavior.

**Contract Document Structure:**

Store contracts in `documentation/service-contracts/{feature}.md` with:

1. **Core Invariants**: What must ALWAYS be true (e.g., "denormalized fields match source at creation")
2. **Method Contracts**: For each public method:
   - Preconditions: What must be true before calling
   - Postconditions: What must be true after success
   - Failure Modes: Table of condition → exact error message
3. **Given/When/Then Behaviors**: Concrete scenarios that map directly to test cases
4. **Edge Cases**: Real-life scenarios and how they're handled
5. **Mutation Testing Checklist**: "Break X → test Y should FAIL"

**Example Contract Entry:**

```markdown
#### `createRecord(data, userId)`

**Preconditions:**

- `data.lessonId` references an existing lesson
- No record exists for this student in this lesson

**Failure Modes:**
| Condition | Error |
|-----------|-------|
| Lesson not found | `"Lesson not found"` |
| Record exists | `"Record already exists for this student in this lesson"` |

**Behaviors:**
GIVEN a student who already has a record for this lesson
WHEN createRecord is called for the same student/lesson
THEN it throws "Record already exists for this student in this lesson"
```

**Benefits:**

- Contracts are the north star; tests validate contracts, not vice versa
- Forces thinking about real-life scenarios before coding tests
- Mutation testing checklist ensures tests actually validate behavior
- Prevents refactoring tests just to make them pass

**When to Use:**

- Services with multiple interacting methods
- Business logic with invariants that span operations
- Features where deletion/cascade behavior matters
- Any service where "what should happen" isn't immediately obvious

### 10.2 Gap Discovery (Actor-Scenario Walkthrough)

Before finalizing contracts, walk through real-life scenarios for each actor:

1. **List actors**: Who uses this feature? (teacher, admin, front desk, student)
2. **For each actor**: What's their happy path? What mistakes might they make? What edge cases?
3. **Ask revealing questions**:
   - "Can this be deleted? Should it be? What would be lost?"
   - "Is this an _event_ needing audit trail, or data that can be overwritten?"
   - "What if they need to correct a mistake?"
   - "What happens mid-process (transfer, substitution, schedule change)?"
4. **Classify gaps**: Handled | Known limitation (v1) | Must fix

This 10-minute exercise often reveals 3-5 edge cases that would otherwise become bugs.

## 11. Mocking Policy (Prefer Boundaries)

- **Prefer mocking external boundaries**:
  - Network/IPC: fetch, email, Cloud Functions
  - Datastores: Firestore Admin SDK via module mocks
  - External services: trial gating, rate limiting (when testing unrelated logic)
- **Sometimes internal services must be mocked** when:
  - The service makes external calls that would fail in unit tests
  - Testing error handling paths that are hard to trigger naturally
  - Isolating the unit under test from complex dependencies
- **Keep mocks typed (NO `any`)**. Define tiny chain types:
  - Example for Firestore query chains:
    - `type QueryChain<T> = { where: (...args: unknown[]) => QueryChain<T>; orderBy: (...args: unknown[]) => QueryChain<T>; startAt: (...args: unknown[]) => QueryChain<T>; endAt: (...args: unknown[]) => QueryChain<T>; limit: (n: number) => { get: () => Promise<{ docs: Array<{ id: string; data: () => T }>} } }`
- **Use `vi.hoisted()` for mock state** that needs to change per-test (see §22).
- Don't mock internal logic just to make tests pass. Validate outputs via public APIs.
- Scope mocks per test (`vi.mock`, `vi.spyOn`) and reset between tests (`vi.clearAllMocks`/`vi.resetModules`).
- If third‑party libraries must be mocked across transitive consumers, consider Vitest `server.deps.inline` guidance.

## 12. Snapshot & Async & Flakiness

- Snapshots:
  - Prefer explicit assertions over broad snapshots.
  - If used, keep them small and stable (e.g., plain objects). Avoid DOM snapshots for Svelte 5 components; favor behavioral integration tests.
- Async reactivity:
  - Prefer `await Promise.resolve()` or targeted microtasks; use `flushSync` from `svelte` after `$effect` updates.
  - Avoid arbitrary sleeps; never rely on timing coincidences.
- Concurrency:
  - Use `.concurrent` only for pure/isolated tests. Use the local `expect` from test context when concurrent.
  - Disable concurrency for tests touching shared globals/state.

Example:

```ts
test.concurrent('isolated test', ({ expect }) => {
	expect(result).toBe(42); // local expect, not global
});
```

### Vitest-idiomatic waiting (DOM/reactivity)

See §6 for detailed guidance on `expect.poll()` and `vi.waitFor()` patterns. Key reminder for snapshots:

- Snapshot matchers are not supported inside `expect.poll`; first resolve with `vi.waitFor`, then snapshot.

Example:

```ts
// Resolve value before snapshotting
const value = await vi.waitFor(() => getValueThatEventuallyResolves());
expect(value).toMatchSnapshot();
```

## 13. Coverage & CI Gates

- Run `npm run test:coverage` locally for significant changes.
- Targets (guideline, not rigid):
  - Core utils/services ≥ 80% lines/branches
  - Smart stores ≥ 70% lines/branches
  - UI components: focus on integration behaviors, not coverage %
- **Coverage is a signal, not a goal**: 100% coverage doesn't guarantee test validity (see §7). Focus on behavior validation over metric satisfaction.
- CI gates:
  - Require tests for logic changes (non‑docs, non‑style) and for bugfixes (regression tests).
  - Flag coverage drops on core domains; reviewers can request additional tests.

## 14. Reviewer Checklist (Anti‑tweaking safeguards)

- Does each test map to a user‑visible behavior or contract?
- Would the test fail if the implementation were wrong? (Perform a quick "break it" thought experiment.)
- Are assertions checking behavior, not mocks/setup? (Avoid "was called" without state/result checks.)
- Are edge cases and error paths covered (invalid inputs, permissions, gating, race conditions)?
- Are mocks limited to boundaries and typed (no `any`), and reset properly?
- Are tests deterministic (no wall‑clock sleeps, nondeterministic data)?
- If a failing test was changed, is there a rationale that preserves the behavior being validated?
- **Schema compliance**: Do mock fixtures include all required fields? (See §20)
- **Authorization**: Does `orgContext` have appropriate capabilities for the operation? (See §21)
- **Domain model**: Are collection names and data structures current, not legacy? (See §19)

## 15. Test Plan Template (to include in PR description)

- Feature summary and user value
- Behaviors and acceptance criteria (Given/When/Then)
- Test map:
  - Unit: utilities/invariants
  - Services: queries/filters/tenancy/errors
  - Stores: actions, optimistic flows, revert
  - Integration: end‑to‑end user flow
- Risks and targeted edge cases
- Out of scope (future tests)

## 16. Additional Vitest References (for authors)

- Why Vitest (DX, Vite‑native, Jest‑compat): vitest “Why” guide
- Features: mocking APIs, coverage, environments, concurrency, snapshots
- In‑source testing: when and how to use `import.meta.vitest`
- Migration/Jest differences: envs, hooks, timeouts

## 17. Realtime Snapshot Reconciliation (Smart Stores)

Tests that exercise optimistic flows reconciled via realtime snapshots (e.g., Template Manager) must follow these rules to ensure validity and determinism.

### 17.1 Single Source of Truth (snapshot-only)

- Do NOT write HTTP responses into store state; assertions should validate that state changes only after snapshot reconciliation. See architectural rule: snapshot-only reconciliation. [optimistic-ui-patterns.md §4]
- Use the public test seam that calls the same function the listener triggers (e.g., `testSimulateSnapshot()` invoking `applyTemplatesSnapshot`). Do not mock internal functions. [testing-standards.md §11]

### 17.2 Schema-valid fixtures (construct validity)

- All server-shaped fixtures must pass the Zod schema used in production.
- For template trees, both `tree.rootId` and all node keys must be UUIDs (use `crypto.randomUUID()`); avoid placeholders like `'root-real'`.

### 17.3 Deterministic gating via observable conditions

- When create/duplicate returns, the store records a tempId→realId mapping from the HTTP body and waits for the snapshot to reconcile. Tests must wait for the mapping to exist before simulating the snapshot.
- Never stack arbitrary microtasks/timeouts. Use `expect.poll` on a real signal, then apply the snapshot. [testing-standards.md §6, §12]

Pattern: action → wait for mapping (`expect.poll`) → simulate snapshot → assert selection/proposals.

Allowed utilities (test-only seams):

- `testSimulateSnapshot()`, `testReset()`, and a minimal `testHasTempToRealMapping()` are acceptable to reach public reconciliation paths without test-mode branches. Never add `import.meta.env.VITEST` conditionals in production code. [testing-standards.md §11]

### 17.4 Anti-patterns (reject during review)

- Guessing timing with stacked `await Promise.resolve()` or sleeps instead of waiting on an observable condition (mapping present, selection changed, proposals persisted).
- Using schema-invalid fixtures (e.g., non-UUID `rootId`/node IDs) that pass only because production validators were bypassed.
- Asserting on mocks (e.g., “fetch was called”) instead of observable state (selection transfer, proposals remapped/persisted).

### 17.5 Quick mutation checks (test validity)

Before merging new snapshot-reconciliation tests, briefly “break the code” locally to verify the test fails:

- Comment out the tempId→realId assignment in the create/duplicate HTTP handler → selection transfer test must fail.
- Comment out selection-transfer block in reconciliation → transfer test must fail.
- Comment out proposal remap/persist lines → proposal remap/persist tests must fail.

These fast checks improve construct validity and prevent tests that merely assert setup.

## 18. Debugging Staging E2E Tests

Staging tests hit **real Firebase** and test **real behavior**. Failures may indicate actual bugs, not just test issues.

### 18.1 Running Staging Tests (PowerShell)

```powershell
$env:STAGING_E2E="1"; npx vitest run tests/staging/api/trial/gating.test.ts
```

### 18.2 Debugging Failures

When a staging test fails unexpectedly:

1. **Add debug logging** to capture actual error responses:

   ```ts
   if (res.status !== 200) {
   	const errorBody = await res.clone().json();
   	console.log('DEBUG: Failed with status', res.status);
   	console.log('DEBUG: Error response:', JSON.stringify(errorBody, null, 2));
   }
   ```

2. **Check seeded data** matches current schema expectations:

   ```ts
   const doc = await adminDb.collection('organizations').doc(orgId).get();
   console.log('DEBUG: Org state:', JSON.stringify(doc.data(), null, 2));
   ```

3. **Distinguish test setup issues from real bugs**:
   - If error message references missing data → test setup issue
   - If error message references permissions/authorization → check `orgContext` and capabilities
   - If operation succeeds when it should fail → real behavior issue (gating not working)

### 18.3 Common Staging Test Pitfalls

- **Wrong document location**: After "Org of One" refactor, trial data lives in `organizations/{orgId}/metadata.trial`, not `users/{uid}/metadata.trial`
- **Missing org membership**: `trialService` validates membership in `organization_members` before checking limits
- **Stale collection references**: Domain model changes (e.g., `teaching_assignments` → `subject_assignments`) invalidate tests using old collections

## 19. Maintaining Tests During Domain Model Evolution

When the domain model changes fundamentally (not just renames), tests using the old model become **invalid**, not just outdated.

### 19.1 Recognizing Domain Model Changes

These are NOT simple renames requiring find-and-replace:

| Change Type                    | Example                                        | Impact                                                                                                            |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Conceptual shift**           | `teaching_assignments` → `subject_assignments` | Teacher-to-class became teacher-teaches-subject-to-class. Authorization logic, queries, and test data all change. |
| **Data location move**         | Trial data from user doc to org doc            | All tests seeding/reading trial data must update paths.                                                           |
| **New required fields**        | `orgId` became required on documents           | All mock data must include the field or schema validation fails.                                                  |
| **Authorization model change** | Capability-based guards added                  | Tests must provide valid `orgContext` with appropriate capabilities.                                              |

### 19.2 When Domain Models Change

1. **Read the implementation first** - Understand what the code does now, not what tests expect
2. **Check schema definitions** - Required fields, nested structures, validation rules
3. **Grep for old references** - `grep -r "old_collection" src/ tests/` to find all usages
4. **Update in order**:
   - Production code first
   - Then test utilities/factories
   - Then individual test files
5. **Verify tests still validate behavior** - Don't just make them pass (see §7)

### 19.3 Example: teaching_assignments → subject_assignments

This wasn't a rename. The domain model changed:

**Before (TeachingAssignment)**:

- Simple: teacher assigned to class
- Query: `teaching_assignments.where('teacherUserId', '==', uid)`

**After (SubjectAssignment)**:

- Rich: teacher teaches specific subject to specific class
- Query: `subject_assignments.where('teacherUserId', '==', uid)`
- New required fields: `subjectId`, `startDate`, `currentLessonNumber`

**Test updates required**:

- Change collection name in all mocks
- Add new required fields to mock data
- Update any assertions checking assignment structure

## 20. Schema Compliance in Test Fixtures

All mock/fixture data **MUST** pass the same Zod schema used in production.

### 20.1 Why This Matters

Services use `schema.safeParse()` to validate data. If mock data fails validation:

- Service returns empty results (silently filters out invalid docs)
- Tests pass with empty arrays, hiding the real issue
- Hours wasted debugging "why isn't my mock data returned?"

### 20.2 Creating Schema-Compliant Fixtures

```ts
// BAD: Missing required fields
const mockDoc = { id: 'doc-1', name: 'Test' };

// GOOD: Include all required fields
const mockDoc = {
	id: 'doc-1',
	orgId: 'test-org', // Required after schema update
	name: 'Test',
	createdByUserId: 'user-1',
	metadata: {
		createdAt: new Date(),
		updatedAt: new Date()
	}
};

// BEST: Use factory with schema validation
import { documentSchema } from '$lib/schemas/document';
const mockDoc = documentSchema.parse({
	id: 'doc-1',
	orgId: 'test-org'
	// ... schema will error if required fields missing
});
```

### 20.3 When Schemas Change

If a schema adds required fields:

1. Update `tests/helpers/mockFactories.ts` first
2. Run all tests - failures reveal which tests use outdated fixtures
3. Update individual test files to use factory or add required fields

## 21. Authorization Model in Tests

Most APIs require `orgContext` with valid capabilities. Understanding this prevents 403 errors in tests.

### 21.1 The OrgContext Structure

```ts
interface OrgContext {
	mode: 'org';
	orgId: string;
	isOwner: boolean;
	membership: OrganizationMember | null;
	organization: Organization | null;
	capabilities: OrganizationCapabilityProfile;
}
```

### 21.2 Using OWNER_CAPABILITY_PROFILE

For tests that need full permissions:

```ts
import { OWNER_CAPABILITY_PROFILE } from '$lib/schemas/organizationCapabilities';

const mockEvent = {
	locals: {
		uid: 'test-user',
		orgContext: {
			mode: 'org',
			orgId: 'test-org',
			isOwner: true,
			membership: null,
			organization: null,
			capabilities: OWNER_CAPABILITY_PROFILE
		}
	}
};
```

### 21.3 Testing Permission Denials

To test that non-owners are blocked:

```ts
// DON'T: Use OWNER_CAPABILITY_PROFILE (grants all permissions)
// DO: Override specific capability to false
const limitedCapabilities = {
	...OWNER_CAPABILITY_PROFILE,
	classes: {
		...OWNER_CAPABILITY_PROFILE.classes,
		canDeleteClasses: false // This specific permission denied
	}
};
```

### 21.4 Common Authorization Errors

| Error                                           | Cause                                               | Fix                                                  |
| ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `403 FORBIDDEN`                                 | Missing capability                                  | Add required capability to `orgContext.capabilities` |
| `403 org mismatch`                              | `orgContext.orgId` doesn't match resource's `orgId` | Ensure mock data and orgContext use same orgId       |
| `Unauthorized: Invalid organization membership` | `organization_members` record missing               | Seed membership record in staging tests              |

## 22. Mock State Management with vi.hoisted()

Use `vi.hoisted()` for mock state that tests need to modify.

### 22.1 The Problem

```ts
// BAD: Mock state defined at module level
let mockData = { count: 0 };

vi.mock('$lib/firebase/admin', () => ({
	adminDb: {
		collection: () => ({ get: () => mockData }) // Always returns initial state
	}
}));

it('test 1', () => {
	mockData.count = 5; // This change may not be visible to mock
});
```

### 22.2 The Solution

```ts
// GOOD: Use vi.hoisted for shared mock state
const hoisted = vi.hoisted(() => ({
	mockData: { count: 0 },
	mockFns: {
		getMock: vi.fn()
	}
}));

vi.mock('$lib/firebase/admin', () => ({
	adminDb: {
		collection: () => ({
			get: () => hoisted.mockFns.getMock()
		})
	}
}));

beforeEach(() => {
	hoisted.mockData.count = 0; // Reset between tests
	hoisted.mockFns.getMock.mockClear();
});

it('test 1', () => {
	hoisted.mockFns.getMock.mockResolvedValue({ exists: true, data: () => hoisted.mockData });
	hoisted.mockData.count = 5; // Now visible to mock
});
```

### 22.3 When to Use vi.hoisted()

- Mock data that varies per test
- Mock functions that need `mockResolvedValueOnce` chains
- Shared state between mock setup and test assertions
- Tracking calls across multiple mock invocations
