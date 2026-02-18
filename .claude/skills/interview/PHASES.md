# Interview Phases

The interview progresses through 5 phases. Each phase must be substantially complete before advancing. Within each phase, ask 3-6 questions, wait for answers, then ask follow-up questions to fill gaps.

## Phase 1: Discovery (The Rough Shape)

**Goal**: Understand the problem space, not the solution.

### Core Questions

1. **Problem Statement**
   - What pain point or gap does this address?
   - Who experiences this pain? (specific personas)
   - What's the current workaround, if any?

2. **Success Criteria**
   - How will we know this is successful?
   - What metrics would indicate success?
   - What's the minimum viable version?

3. **Scope Boundaries**
   - What's explicitly OUT of scope?
   - Are there related features we should NOT build yet?
   - What's the smallest thing we could ship?

4. **Stakeholder Context**
   - Who else cares about this?
   - Are there competing priorities or dependencies?
   - Any regulatory/compliance considerations?

### Anti-Patterns to Challenge

- "Let's build X" without stating the problem
- Features that solve hypothetical problems
- Scope that encompasses multiple distinct features
- Solutions looking for problems

---

## Phase 2: Architecture (The Structure)

**Goal**: Establish technical shape and integration points.

### Core Questions

1. **System Boundaries**
   - Where does this live in the codebase? (module, service, layer)
   - What existing systems does it interact with?
   - Client-side, server-side, or both?

2. **Data Model**
   - What entities are involved?
   - New schemas, or extending existing?
   - Relationships to other data? (ownership, references)

3. **State Management**
   - Real-time requirements?
   - Caching considerations?
   - Where does state live?

4. **Integration Points**
   - API endpoints required?
   - External services?
   - Events/webhooks?

5. **Tech Stack Fit**
   - Does this align with existing patterns?
   - Any new dependencies required? Why?
   - Reusable components/utilities available?

### Templates by Domain

**For API/Service Tasks**:

- Endpoint structure and naming
- Request/response schemas
- Authentication/authorization model
- Rate limiting requirements

**For Data Tasks**:

- Schema definition
- Migration strategy (if modifying existing data)
- Validation rules
- Security considerations

**For Integration Tasks**:

- Authentication/authorization model
- Retry/failure handling
- Timeout considerations
- Error propagation

---

## Phase 3: Deep Dive (The Details)

**Goal**: Nail down specifics that determine implementation quality.

### UX Deep Dive (if applicable)

1. **User Flows**
   - Step-by-step: what does the user do?
   - What feedback do they receive at each step?
   - Error states and recovery paths?

2. **Edge Cases**
   - Empty states (no data yet)
   - Loading states (slow network)
   - Error states (failed operations)
   - Boundary conditions (max items, long text)

3. **Permissions**
   - Who can see this?
   - Who can modify this?
   - Role-based differences?

### Technical Deep Dive

1. **Performance**
   - Data volume expectations?
   - Pagination/streaming needed?
   - Expensive computations to optimize?

2. **Security**
   - Input validation requirements?
   - Injection vectors to guard?
   - Sensitive data handling? (PII, credentials)
   - Audit logging needed?

3. **Observability**
   - What should we log?
   - Error tracking requirements?
   - Metrics to collect?

4. **Testing Strategy**
   - Critical paths to test?
   - Edge cases that need coverage?
   - Integration test scenarios?

---

## Phase 4: Refinement (The Polish)

**Goal**: Fill remaining gaps and validate completeness.

### Validation Questions

1. **Implementation Clarity**
   - Can you describe the implementation in concrete steps?
   - Are there any "figure it out later" areas?
   - What's the riskiest technical unknown?

2. **Acceptance Criteria**
   - Can each criterion be objectively verified?
   - Are criteria specific enough to test?
   - Missing any "obvious" requirements?

3. **Dependencies**
   - Blocked by anything?
   - Blocking anything else?
   - Parallel work possible?

4. **Scope Check**
   - Does scope match expected effort?
   - Should this be decomposed into smaller tasks?
   - What could be deferred to a follow-up?

### Self-Check Checklist

Before concluding, verify you can answer YES to ALL:

- [ ] I understand the problem being solved
- [ ] I know who uses this and how
- [ ] I can describe the data model changes
- [ ] I know where code changes live
- [ ] I can list the security considerations
- [ ] I can write the acceptance criteria
- [ ] I can identify the test scenarios
- [ ] I understand the edge cases
- [ ] I know what's out of scope
- [ ] I could implement this without asking more questions

If any answer is NO, continue interviewing.

---

## Phase 5: Documentation (The Handoff)

**Goal**: Persist everything so future sessions have full context.

### Write the Spec

Structure the output as a proper spec document:

```markdown
## Problem

<1-2 sentences on the pain point>

## Solution

<High-level approach>

## Scope

### In Scope

- <bullet points>

### Out of Scope

- <bullet points>

## Technical Design

### Data Model

<Schema changes, data structures>

### Components/Modules

<Files affected, new files needed>

### Integration Points

<APIs, services, events>

## User Flow (if applicable)

1. User does X
2. System responds with Y
3. ...

## Edge Cases

- <case>: <handling>

## Security Considerations

- <consideration>

## Acceptance Criteria

- [ ] <testable criterion>
- [ ] <testable criterion>
```

### Save the Spec

Write the spec to an appropriate location (e.g., `documentation/specs/`, `plans/`).

### Create Bead for Tracking

```bash
bd create "<feature title>"
bd update <bead-id>  # Add description, acceptance criteria, dependencies
```

---

## Multi-Session Support

Interviews may span multiple context windows.

### Ending a Session Mid-Interview

1. **Document progress** in a spec file or notes
2. **Note open questions** that need answers next session
3. **Commit partial progress** if using version control

### Resuming a Session

1. **Read the partial spec** to see where we left off
2. **Summarize** what's been established so far
3. **Continue** from the incomplete phase
