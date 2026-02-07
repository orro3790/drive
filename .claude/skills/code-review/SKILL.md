---
name: code-review
description: Code review workflows for thorough review and senior-level second opinions. Use when reviewing code changes, PRs, or implementation plans.
---

# Code Review

Thin dispatcher that scopes the review and delegates to the `code-reviewer` subagent.

## Workflow

### 1. Determine Scope

Figure out what to review from user input or context:

- **Explicit files/paths** — User named specific files
- **Git diff** — Run `git diff` or `git diff origin/develop...HEAD` to get changes
- **PR** — Use `gh pr diff` if a PR number is given
- **"Review my recent work"** — Use `git diff --stat origin/develop...HEAD` to summarize, confirm scope with user

### 2. Determine Review Type

- **Standard** (default): Fresh review of the code
- **Senior**: Second opinion on an existing review — user provides or references the initial review

### 3. Dispatch to Subagent

Launch the `code-reviewer` agent via the Task tool:

- Pass the scope (file list, diff, or PR reference)
- Pass the review type
- Run in background if the diff is large, so the user can continue working

### 4. Present Findings

When the subagent returns:

1. Show the findings table to the user
2. Ask: **"Would you like me to apply these fixes? (yes / no / selective)"**
   - If "selective," ask which specific fixes to apply
   - If "yes," apply fixes one category at a time with progress updates
   - After applying, run linter and tests to verify no regressions
