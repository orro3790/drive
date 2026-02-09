---
name: execute
description: Complete implementation lifecycle for executing a plan file. Handles fresh starts AND resuming partially completed work.
---

# Execute Plan

The complete implementation lifecycle for executing a plan file. Handles fresh starts AND resuming partially completed work.

**Important:** This skill must be run directly by the primary agent. Do not delegate execution to subagents or use the Task tool to run a plan.

## Usage

```
/execute <task-id>
/execute <plan-file-path> [task-id]
```

- `task-id`: BEADS task ID. Required if the plan file path is omitted. If a plan path is provided and task-id is omitted, derive from the plan filename.
- `plan-file-path`: Path to the implementation plan (e.g., `ralph/plans/my-feature.md`). Optional when the bead body includes a `Source:` line pointing to the plan/spec.

---

## Phase 1: Preflight

**First, detect if this is a fresh start or resume, then set up accordingly.**

### 1.0 Resolve Plan Source (if missing)

If `plan-file-path` was not provided:

1. `bd show <task-id>`
2. Find the first line starting with `Source:` in the bead body.
3. Extract the path (and optional section) and use it as the plan source.
4. If no `Source:` line is present or the path is ambiguous, stop and ask the user for the plan file path (then update the bead to include `Source:` once known).

### 1.1 Check BEADS Status

```bash
bd show <task-id>
```

Look at the status:

- `open` → Fresh start (run full preflight)
- `in_progress` → Resume (skip most preflight)
- `closed` → Already done (warn user, exit)

### 1.2 Check for Existing Branch

```bash
git branch --list "*<task-id>*"
```

- Branch exists → Resume (checkout existing branch)
- No branch → Fresh start (create new branch)

### 1.3 Check Git History (if resuming)

```bash
git log --oneline -20
```

Review recent commits to understand what's already done. Cross-reference with the plan to identify remaining work.

### 1.4 Setup (Fresh Start)

If status=open and no branch exists:

1. **Rename conversation** for easy retrieval:

   ```
   /rename ✳[tree-letter] <task-id>
   ```

   Example: `/rename ✳[a] dzz.1`

2. **Sync with develop**:

   ```bash
   git fetch origin develop && git rebase origin/develop
   ```

3. **Create feature branch**:

   ```bash
   git checkout -b <task-id>/implementation
   ```

4. **Update BEADS status**:

   ```bash
   bd update <task-id> --status in_progress
   ```

### 1.5 Setup (Resume)

If status=in_progress and branch exists:

1. **Checkout existing branch**:

   ```bash
   git checkout <task-id>/implementation
   ```

2. **Sync with develop** (get latest changes):

   ```bash
   git fetch origin develop && git rebase origin/develop
   ```

3. **Skip** branch creation and status update (already done)

---

## Phase 2: Execute

### 2.1 Read the Plan

Read the plan file (from CLI arg or bead `Source:`) and understand ALL implementation steps.

### 2.2 Determine Progress (if resuming)

Cross-reference the plan with:

- Git log (what commits exist?)
- BEADS comments (what PRs were submitted?)
- Existing code (what's already implemented?)

Identify which steps are:

- ✅ Completed (skip)
- 🔄 Partially done (finish)
- ⬜ Not started (implement)

### 2.3 Create Task List

Use TaskCreate to track remaining work. If resuming, only add incomplete items.

### 2.4 Implement Remaining Steps

Work through each incomplete step:

1. Mark as `in_progress`
2. Implement
3. Mark as `completed`
4. Commit: `git add . && git commit -m "type(scope): description"`

---

## Phase 3: Code Review

**Before submitting a PR, run a self-review using the code-review skill.**

### 3.1 Invoke Code Review

```
/code-review
```

This performs a thorough review checking:

- Functional correctness
- Maintainability and design
- Compliance and security
- Architecture and patterns
- Testing and CI
- i18n (Paraglide) verification

### 3.2 Address Findings

If the review identifies issues:

1. Fix critical and high-severity issues immediately
2. Document any intentional deviations
3. Re-run review if significant changes were made

### 3.3 Commit Fixes

```bash
git add . && git commit -m "fix: address code review feedback"
```

Only proceed when the review passes or all findings are addressed.

---

## Phase 4: Type Check

**MANDATORY — Must pass before creating PR.**

### Formatting (Automatic)

**Handled automatically by pre-commit hook.** When you run `git commit`, lint-staged runs Prettier and ESLint on staged files. You'll see the output in the commit response. No manual formatting step needed.

### Type Check

```bash
pnpm exec svelte-check --tsconfig ./tsconfig.json
```

Must pass with **0 errors**. Warnings are acceptable but fix if trivial.

Note: Paraglide types are gitignored and regenerated at build time. If you added i18n keys, run `pnpm dev` or `pnpm build` first so svelte-check sees the generated types.

### CRITICAL: Fix ALL Errors

**You are responsible for a clean codebase, not just your changes.**

If `svelte-check` reports errors:

1. **Fix them ALL** — whether you introduced them or not
2. **Do NOT skip errors** with "these aren't from my changes"
3. **Do NOT proceed** to Phase 5 with any errors remaining
4. **Commit fixes**: `git add . && git commit -m "fix: resolve type errors"`

**Why:** Pre-existing errors block other agents and accumulate technical debt. Every PR must leave the codebase at zero errors. No exceptions.

**Only proceed to Phase 5 when type check passes with 0 errors.**

---

## Phase 5: Component Audit (for new components)

**If the implementation created new Svelte components, audit them for quality.**

### 5.1 Identify New Components

Check git diff for new `.svelte` files:

```bash
git diff --name-status origin/develop...HEAD | grep "^A.*\.svelte$"
```

If no new components were added, skip to Phase 6.

### 5.2 Run Component Audit

For each new component, invoke the component-audit skill:

```
/component-audit <component-path>
```

This checks:

- Primitive & component reuse (are existing primitives being used?)
- Minimalism and lean DOM
- Accessibility
- i18n compliance
- UX gaps

### 5.3 Address Findings

1. Replace bespoke UI with primitives where appropriate
2. Fix accessibility issues
3. Add missing i18n tokens
4. Commit fixes:
   ```bash
   git add . && git commit -m "fix: address component audit feedback"
   ```

### Why This Matters

Ensures new components follow project standards, use existing primitives, and maintain visual consistency with the rest of the app.

---

## Phase 6: Documentation Audit

**After code review passes, verify documentation is current.**

Spawn the documentation-auditor agent to check:

- README or CLAUDE.md need updates for new features/patterns
- JSDoc comments match implementation
- API documentation reflects changes
- Stale docs that reference changed code

### 6.1 Run Audit

Use the Task tool with `subagent_type='documentation-auditor'`:

```
Review changes in this branch and check if documentation needs updating.
Focus on: README, CLAUDE.md, JSDoc, and any documentation/ files.
```

### 6.2 Apply Updates

If the auditor identifies stale documentation:

1. Make the suggested updates
2. Commit: `git add . && git commit -m "docs: update documentation for [feature]"`

Skip this phase for documentation-only or trivial changes.

---

## Phase 7: Pre-Push Validation

**Run `pnpm validate` before pushing. The pre-push hook will block if this fails.**

```bash
pnpm validate  # lint + type check
```

If validation fails:

1. **Fix automatically:**

   ```bash
   pnpm format && git add -A && git commit -m "chore: format files"
   pnpm exec eslint . --fix && git add -A && git commit -m "fix: auto-fix ESLint"
   ```

2. **Fix manually:** Read errors, fix issues (deprecated syntax, import restrictions, type errors), commit fixes

3. **Re-run:** `pnpm validate` until it passes

**Only proceed to Phase 8 when validation passes.**

---

## Phase 8: Browser Verification (BINDING VERDICT)

**Verify BEFORE pushing. This phase uses the `/verify` skill. Its verdict is BINDING.**

### 8.1 Invoke Verification

Run the verify skill with the planned test criteria:

```
/verify <primary-route>
```

Where `<primary-route>` is the main route affected (e.g., `/app/dashboard`).

The `/verify` skill will:

1. Verify the dev server is running (ask user to start if not)
2. Navigate to the route in a real browser
3. Step through test plan items as a real user would
4. Evaluate not just functionality but **design quality and UX**
5. Return a binding verdict

### 8.2 Respect the Verdict

| Verdict   | Meaning                              | Required Action                  |
| --------- | ------------------------------------ | -------------------------------- |
| **PASS**  | Tests pass AND quality bar met       | Proceed to Phase 9 (Close Task)  |
| **BLOCK** | Issues must be fixed                 | **STOP. Fix issues. Re-verify.** |
| **WARN**  | Functional OK, minor polish concerns | May proceed, note in PR          |

### 8.3 If BLOCK — You MUST Stop

**BLOCK means DO NOT PUSH. This is non-negotiable.**

1. Read every issue in the verification result
2. Fix each issue in code (not just functionality — design too)
3. Commit: `git add . && git commit -m "fix: address verification feedback"`
4. Re-run `/verify` until verdict is PASS or WARN

**Do NOT push code that fails verification.** Fix it first.

### 8.4 Quality is the Point

The `/verify` skill doesn't just check "does it work." It evaluates:

- **Visual polish:** Does it look like polished SaaS or AI slop?
- **UX flow:** Is the interaction smooth or confusing?
- **Design tokens:** Using `--spacing-*`, `--font-size-*` correctly?
- **The vibe check:** Would we proudly demo this to Samsung?

---

## Phase 9: Close Task

**CRITICAL: Close BEFORE submitting the PR.**

When browser verification passed and the branch is ready to submit:

```bash
bd close <task-id>
```

**Checklist before closing:**

- [ ] Code review completed and issues addressed
- [ ] Type check passed with 0 errors
- [ ] `pnpm validate` passed
- [ ] `/verify` verdict is PASS or WARN

**Immediately continue to Phase 10 to submit the PR.**

---

## Phase 10: Submit PR

**Only after browser verification passes (PASS or WARN) and the bead is closed.**

```bash
git push -u origin HEAD
gh pr create --base develop --title "feat(<scope>): <description>" --body "## Summary\n\n- <changes>\n\n## Test Plan\n\n- [ ] <test steps>\n\n## Verification\n\n✅ Passed /verify with [PASS|WARN]"
bd update <task-id> --comment "PR: <pr-url>"
```

If `git push` fails: read the error, fix the issue, commit, re-validate, retry push. **Never leave a task with unpushed commits.**

For multi-PR plans, submit each PR as it's ready. Don't wait until the end.

---

## Phase 11: Merge PR

**MANDATORY — Do NOT end the workflow without merging. Creating a PR is NOT done.**

After PR is submitted, wait for CI to pass, then merge:

### Check CI Status

```bash
gh pr checks <pr-number> --watch
```

Wait for CI to pass. If CI fails, fix the issues and push again.

### Merge

```bash
gh pr merge <pr-number> --squash
```

- Uses squash merge to keep develop history clean
- If merge fails (CI blocking, conflicts), log the issue and pause the workflow

### Sync After Merge

```bash
git fetch origin develop && git rebase origin/develop
git branch -d <feature-branch>  # Clean up local branch manually
```

---

## Example: Fresh Start

```
Human: /execute dzz.1

Agent: Resolving plan source...
  bd show dzz.1 → Source: ralph/plans/search-filters.md (Task 2)
  → Using plan: ralph/plans/search-filters.md

Agent: Checking task status...
  bd show dzz.1 → status: open
  git branch --list "*dzz.1*" → (none)
  → Fresh start

[Preflight]
- /rename ✳[a] dzz.1
- git fetch origin develop && git rebase origin/develop... done
- git checkout -b dzz.1/implementation... done
- bd update dzz.1 --status in_progress... done

[Execute]
- Reading plan... 7 steps found
- Creating todo list...
- Implementing step 1/7...
...
- All steps complete

[Code Review]
- Running /code-review...
- 2 issues found, fixing...
- Re-review passed

[Documentation Audit]
- Spawning documentation-auditor...
- No updates needed

[Browser Verification]
- Connecting to localhost:5173...
- Taking snapshot of /search...
- Testing filter interactions...
- All checks passed

[Close Task]
- bd close dzz.1... done

[Submit PR]
- git push -u origin HEAD... done
- gh pr create... PR #123 created
- bd update dzz.1 --comment "PR: #123"
```

## Example: Resume After Pause

```
Human: /execute dzz.1

Agent: Resolving plan source...
  bd show dzz.1 → Source: ralph/plans/search-filters.md (Task 2)
  → Using plan: ralph/plans/search-filters.md

Agent: Checking task status...
  bd show dzz.1 → status: in_progress
  git branch --list "*dzz.1*" → dzz.1/implementation
  → Resuming existing work

[Resume]
- git checkout dzz.1/implementation... done
- git fetch origin develop && git rebase origin/develop... done

[Determine Progress]
- Reading plan... 7 steps total
- Checking git log... 4 commits found
- Steps 1-4 appear complete
- Steps 5-7 remaining

[Execute]
- Creating todo list with 3 remaining items...
- Implementing step 5/7...
```

## Git Commands Reference

| Task              | Command                                                 |
| ----------------- | ------------------------------------------------------- |
| Sync with develop | `git fetch origin develop && git rebase origin/develop` |
| Create branch     | `git checkout -b feature/name`                          |
| Commit            | `git add . && git commit -m "type(scope): msg"`         |
| Push              | `git push -u origin HEAD`                               |
| Create PR         | `gh pr create --draft --base develop`                   |

---

## Troubleshooting

### "Branch already used by worktree"

You tried to checkout develop. Use fetch+rebase instead:

```bash
git fetch origin develop && git rebase origin/develop
```

### Merge Conflicts During Rebase

```bash
# Fix conflicts in files
git add <fixed-files>
git rebase --continue
# OR
git rebase --abort  # Cancel and try again
```
