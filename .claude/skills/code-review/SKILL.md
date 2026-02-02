---
name: code-review
description: Self-reviews implementation before submitting PR. Catches bugs, security issues, and quality problems.
---

# Code Review

Perform a thorough self-review of your implementation before submitting a PR.

## Review Checklist

When conducting a code review, evaluate:

- **Functional Correctness** — Does the code do what it's supposed to? Are edge cases handled?
- **Maintainability and Design** — Is the code clean, well-organized, and following project patterns?
- **Security and Compliance** — No hardcoded secrets, proper input validation, safe API usage
- **Architecture and Patterns** — Follows existing project conventions and patterns
- **Error Handling** — Proper exception handling, meaningful error messages

## Process

### 1. Review Changed Files

```bash
git diff --name-only origin/develop...HEAD
```

### 2. For Each File

Read the file and evaluate against the checklist above.

### 3. Report Findings

```markdown
## Code Review Results

| Category               | Status   | Notes   |
| ---------------------- | -------- | ------- |
| Functional correctness | ✅/⚠️/❌ | Details |
| Maintainability        | ✅/⚠️/❌ | Details |
| Security               | ✅/⚠️/❌ | Details |
| Architecture           | ✅/⚠️/❌ | Details |
| Error handling         | ✅/⚠️/❌ | Details |

### Issues Found

1. **[Severity]** Description and location
2. ...

### Verdict

PASS / NEEDS FIXES
```

## Severity Levels

- **Critical**: Security vulnerabilities, data loss risks, crashes
- **High**: Bugs that affect users, broken functionality
- **Medium**: Code quality issues, missing validation
- **Low**: Style issues, minor improvements
