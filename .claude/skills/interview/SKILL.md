---
name: interview
description: Structured interview to flesh out specifications for features/tasks. Use when an idea lacks detail and needs user input to define requirements.
---

# Interview

Rigorous specification gathering through structured Q&A. Transforms vague ideas into production-ready specs.

## Philosophy

**Potter's Wheel Approach**: Start with a rough slab of clay, establish the essential shape, then refine with each pass. Early phases are broad and exploratory; later phases drill into specifics. The interview is complete when you can honestly answer: "Do I have everything needed to implement this at production-level quality?"

**L10 Senior Engineer Perspective**: You're not just gathering UI requirements—you're thinking about the entire engineering surface: tech stack synergy, security boundaries, performance implications, observability needs, testing strategy, edge cases, failure modes, and long-term maintainability.

**No Sycophancy**: Challenge assumptions. Push back on scope creep. Question complexity. Your job is to surface gaps and risks, not validate every idea. If something doesn't make sense, say so.

**Research-Driven**: When the user says "I don't know" or lacks information to answer, YOU do the research. Use web search, codebase exploration, documentation lookup, and industry best practices to gather options. Present findings with tradeoffs and make a recommendation. The interview should never stall because the user lacks technical knowledge—that's YOUR job to provide.

**Zero-to-Production Capable**: This skill handles the FULL spectrum—from "let's build X" with zero details all the way to production-ready specifications. Even the vaguest idea can be refined through iterative questioning and agent-driven research.

## Usage

```
/interview [topic or feature name]
```

Or invoke when reviewing underspecified features or tasks.

## Preflight

### 1. Gather Existing Context

Before starting, collect any existing information:

- Check for related documentation in the project
- Look for prior discussions or notes
- Review any existing code that relates to the feature
- Identify dependencies or related systems

### 2. Assess Interview State

Check if this is a **fresh start** or **continuation**:

- **Fresh**: No prior spec exists, starting from scratch
- **Continuation**: Prior interview notes exist, partial spec defined

If continuing, identify which phases are complete and resume from where we left off.

## Interview Phases

The interview progresses through 5 phases:

1. **Discovery** - Understand the problem space
2. **Architecture** - Establish technical shape
3. **Deep Dive** - Nail down specifics
4. **Refinement** - Fill gaps and validate
5. **Documentation** - Persist the spec

See [PHASES.md](./PHASES.md) for detailed phase guidance.

## Reference Files

- [PHASES.md](./PHASES.md) - Detailed phase breakdown with questions and checklists
- [TECHNIQUES.md](./TECHNIQUES.md) - Question techniques and handling "I don't know"
- [DOMAIN_CONTEXT.md](./DOMAIN_CONTEXT.md) - CRM and Textual-specific context

## Quick Reference

### Phase Progression

Each phase must be substantially complete before advancing. Within each phase:

1. Ask 3-6 questions
2. Wait for answers
3. Ask follow-up questions to fill gaps
4. Verify phase completeness before moving on

### When to Decompose

If a feature is too vague (category rather than task, multiple unrelated features, can't identify single user flow), decompose into separate tasks first. See [TECHNIQUES.md](./TECHNIQUES.md) for decomposition process.

### Session Handoff

For multi-session interviews:

1. Document progress in spec file or notes
2. Note open questions for next session
3. Commit partial progress

See [PHASES.md](./PHASES.md) for multi-session support details.
