---
name: nightly-audit
description: Run long-running, non-destructive audits overnight. Produces detailed reports for morning review.
---

# Nightly Audit

Thin dispatcher that launches background `nightly-auditor` agents for overnight execution.

## Usage

```
/nightly-audit <audit-type>
/nightly-audit all
```

**Audit types:** `documentation-health`, `project-organization`, `dead-code`, `code-quality`, `all`

## Workflow

### 1. Parse Audit Type

- If no type given, ask user which audit(s) to run
- If `all`, dispatch all four audit types

### 2. Dispatch to Subagent

Launch the `nightly-auditor` agent via the Task tool with `run_in_background: true`:

- Pass the audit type
- For `all`, launch one agent per audit type in parallel (4 agents)
- Confirm to user: "Audits running in background. Reports will be in `logs/nightly/{date}/`"

### 3. Morning Review

When user returns and asks about results:

- Read reports from `logs/nightly/{date}/`
- Summarize findings by severity
- Ask which recommendations to act on
