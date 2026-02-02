---
name: verify
description: Browser-based verification of user flows. Evaluates like a demanding user and designer, not a checkbox robot.
---

# /verify - Browser Verification Skill

Step through user flows in a real browser. Evaluate like a user and designer, not a checkbox robot.

## Invocation

```
/verify [target] [--from-pr | --from-bead <id> | --checklist "..."]
```

**Examples:**

- `/verify / --from-pr` — verify current PR's test plan on landing page
- `/verify /app/dashboard --from-bead abc123` — verify bead's acceptance criteria
- `/verify / --checklist "Hero renders, city lights animate, scroll works"`

## Philosophy

**You are not a QA robot ticking boxes. You are a demanding user and designer.**

Ask yourself at every step:

- Does this feel like a polished global SaaS product?
- Or does it feel like AI slop from a coding bootcamp tutorial?
- Would this embarrass us in a client demo or investor pitch?
- Is there thoughtful attention to detail, or just "make it work" energy?

**Reference quality bar:** Our landing page with animated lightning nodes, three.js, lenis smooth scrolling, and custom microinteractions. That level of craft.

## Process

### 1. Setup

#### Verify Dev Server

The dev server should already be running. Check:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "down"
```

If not running, ask the user to start it (`pnpm dev` in a separate terminal).

#### Load Auth State (if route requires auth)

```bash
agent-browser --session driver-ops state load .agent-browser/driver-ops-auth.json 2>/dev/null
```

If no saved auth exists or it's stale, use `/dev-login` skill first.

### 2. Navigate & Interact

Use **agent-browser** for all browser automation. Refer to the Agent Browser skill for technical details (commands, selectors, waiting strategies).

**Critical:** Use the project session name `--session driver-ops` (port 5173).

### 3. Execute Each Test Item

For each item in the test plan:

1. **Navigate** — open the target route
2. **Snapshot** — get interactive elements
3. **Interact** — fill forms, click buttons, etc.
4. **Wait** — for network/DOM to settle after actions
5. **Evaluate quality** — not just "does it work" but "is it good?"

**Quality checklist for EVERY screen:**

- [ ] Visual hierarchy clear? Or flat wall of sameness?
- [ ] Spacing consistent? Using design tokens or random values?
- [ ] Typography intentional? Or random sizes everywhere?
- [ ] Colors correct? surface-inset vs surface-primary used properly?
- [ ] Loading states? Or jarring empty→full jumps?
- [ ] Error states? Or silent failures?
- [ ] Mobile responsive? Or broken at narrow widths?
- [ ] Microinteractions? Or static and lifeless?
- [ ] **The vibe check:** Does this look expensive or cheap?

### 4. Document Findings

For each issue found:

```
### [ISSUE] Short description

**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**Location:** /route/path or ComponentName
**Expected:** What it should be
**Actual:** What it is
**Screenshot:** [if applicable]
**Why it matters:** User impact / perception
```

### 5. Return Verdict

**PASS** — All functional tests pass AND quality bar met. Ready to merge.

**BLOCK** — Issues found that must be fixed before merge:

- Any CRITICAL or HIGH severity issues
- Multiple MEDIUM issues
- Obvious AI slop / bootcamp patterns
- Would embarrass us in a demo

**WARN** — Functional tests pass but quality concerns exist:

- Minor polish issues (LOW severity)
- Could ship but should file follow-up

## Verdict Format

```markdown
## Verification Result: [PASS | BLOCK | WARN]

### Summary
[1-2 sentences on overall assessment]

### Functional Tests
- [x] Item 1 — passed
- [x] Item 2 — passed
- [ ] Item 3 — FAILED: [reason]

### Quality Assessment
**Visual Polish:** [Good | Needs Work | AI Slop]
**UX Flow:** [Smooth | Acceptable | Confusing]
**Mobile:** [Responsive | Broken | Not Tested]
**Vibe Check:** [Would demo proudly | Hesitant | Embarrassing]

### Issues Found
[List of issues with severity]

### Required Actions
[What must be done before this can merge]

### Verdict Binding
This verdict is BINDING. If BLOCK, the calling flow MUST NOT proceed to merge.
Fix the issues and run /verify again.
```

## Integration with /execute

When called from execute skill Phase 9:

1. Execute passes the PR's test plan to /verify
2. /verify runs full verification
3. If verdict is **BLOCK**: Execute MUST stop. Do not merge. Fix issues first.
4. If verdict is **WARN**: Execute may proceed but should note concerns in PR.
5. If verdict is **PASS**: Execute proceeds to merge.

**Execute skill MUST respect the verdict. No exceptions.**

## Common AI Slop Patterns to BLOCK

- Cards with left-border accents (the bootcamp special)
- Everything in a card when it doesn't need to be
- Random font sizes with no hierarchy
- Inconsistent spacing (12px here, 16px there, 24px elsewhere)
- No loading states (empty → full with no transition)
- Generic placeholder text left in
- Console errors visible
- Broken mobile layouts
- No hover/focus states on interactive elements
- Data tables that look like Excel dumps
- Forms with no validation feedback
- Modals that don't close properly
- Z-index wars (dropdowns behind other elements)

## Remember

You're not verifying that code runs. You're verifying that we'd be proud to show this to:

- A potential investor
- A logistics company partnership meeting
- A delivery manager comparing us to competitors
- Ourselves in 6 months

If the answer is "I'd want to apologize or explain it away" — that's a BLOCK.
