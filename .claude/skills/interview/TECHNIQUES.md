# Interview Techniques

Effective questioning and research strategies for productive interviews.

## Making Questions Specific

Vague questions get vague answers. Make them concrete:

**Bad → Good Examples**:

- ❌ "What should it do?"
- ✅ "When a user submits invalid input, should we: (a) reject immediately, (b) attempt auto-correction, (c) queue for manual review?"

- ❌ "How should errors be handled?"
- ✅ "If the external API times out after 30s, should we: (a) show error and let them retry, (b) queue for background processing, (c) fall back to cached data?"

---

## Offering Sensible Defaults

Reduce decision fatigue by proposing reasonable defaults:

"Unless you say otherwise, I'll assume:

- Standard REST conventions for the API
- JSON request/response bodies
- 30-second timeout for external calls

Sound right?"

---

## Batching Related Questions

Group questions by topic to reduce back-and-forth:

```markdown
### Data Model Questions

1. What fields are required vs optional?
2. Any computed/derived fields?
3. What's the ownership model?
4. Soft delete or hard delete?
```

---

## Accepting "You Decide"

If user says "you decide" or "whatever makes sense":

- Make a reasonable choice
- Document the decision explicitly
- Note it can be revisited

---

## Handling "I Don't Know"

When the user can't answer a question, **YOU do the work**. Never let the interview stall.

### Research Triggers

User responses that trigger research mode:

- "I don't know"
- "I'm not sure"
- "What do you recommend?"
- "What are the options?"
- "I haven't thought about that"
- "You're the expert"

### Research Actions

**1. Codebase Exploration**

- Search for existing patterns: `Grep`, `Glob`, `Read`
- Find similar implementations in the project
- Check how related features handle the same question

**2. Web Search**

- Industry best practices
- Library/framework documentation
- Competitor analysis (how do others solve this?)

**3. Documentation Lookup**

- Project docs
- Tech stack docs (Python, Textual, etc.)
- Available MCP tools for documentation queries

### Research Output Format

After researching, present findings as:

```markdown
### Research: [Question Topic]

**Options Found:**

1. **Option A: [Name]**
   - How it works: ...
   - Pros: ...
   - Cons: ...
   - Used by: [examples]

2. **Option B: [Name]**
   - How it works: ...
   - Pros: ...
   - Cons: ...
   - Used by: [examples]

**Recommendation:** Option [X] because [reasoning aligned with project context]

**Decision needed:** Should we go with this, or do you have a preference?
```

### Research Timing

- **Immediate**: If the answer blocks further questions
- **Deferred**: If other questions can proceed (note it, continue, research later)
- **Batched**: Group related unknowns and research together

---

## Decomposition During Interview

If a feature is too vague to interview directly, decompose it first.

### Signs Decomposition is Needed

- Title is a category, not a task ("Mobile Support", "Notifications")
- Can't identify a single user flow
- Multiple unrelated features bundled together
- Scope is very large

### Decomposition Process

1. **Identify distinct capabilities** within the vague feature
2. **List each capability** as a separate task
3. **Interview each** separately
4. **Update the original** to be a parent/epic container
