---
name: spec-to-beads
description: Converts specifications or implementation plans into actionable BEADS with exhaustive implementation details and source traceability.
---

# Spec/Plan to Beads Skill

Convert product specifications or implementation plans into actionable BEADS.

## Usage

```
/spec-to-beads <spec-or-plan-file>
```

Accepts:

- Product specifications
- Implementation plans (e.g., from plan mode)
- Technical design documents
- Feature requirement documents

## Process

### 1. Analyze Source Document

- Read the spec/plan file thoroughly
- Identify discrete, implementable units of work
- Note dependencies between units
- Capture the source file path for traceability

### 2. Create Beads

For each unit of work, create a bead with:

```bash
bd.exe add --title "<clear title>" --body "<detailed body>"
```

### Source Traceability (REQUIRED)

**Every bead body MUST begin with a source reference:**

```
Source: <path-to-spec-or-plan-file>

<rest of bead body>
```

This allows implementers to find the original context, decisions, and rationale.

### Bead Quality Requirements

**CRITICAL: Beads must be exhaustively detailed. No hand-waving.**

Each bead MUST include:

1. **Source Reference** (first line)
   - Path to the originating spec/plan file
   - Section reference if applicable (e.g., "Task 3" or "## Authentication")

2. **Clear Objective**
   - What exactly needs to be built/changed
   - Expected outcome when complete

3. **Implementation Details**
   - Specific files to create/modify
   - Functions/components to implement
   - Data structures involved

4. **Dependencies**
   - Other beads that must complete first
   - External dependencies to install
   - Environment setup required

5. **Acceptance Criteria**
   - Testable conditions for "done"
   - Edge cases to handle
   - Error scenarios to cover

6. **Technical Constraints**
   - Performance requirements
   - Compatibility requirements
   - Security considerations

### 3. Set Up Dependencies

Link related beads:

```bash
bd.exe link <child-id> <parent-id>
```

### 4. Validate Completeness

For each bead, verify:

- [ ] Does it reference the source document?
- [ ] Can an agent implement this without asking questions?
- [ ] Are all file paths explicit?
- [ ] Are all function signatures defined?
- [ ] Are edge cases enumerated?
- [ ] Are error handling requirements specified?

**If ANY answer is NO:** The bead is underdeveloped.

## Handling Underdeveloped Beads

If a bead lacks sufficient detail:

1. Do NOT create a vague bead
2. Inform the user: "This feature needs more specification"
3. Recommend: `/interview <specific-topic>` for that area
4. List the specific questions that need answers

## Anti-Patterns (DO NOT)

- ❌ "Implement the authentication system" (too vague)
- ❌ "Add error handling" (which errors? how?)
- ❌ "Make it faster" (what metric? what target?)
- ❌ "Follow best practices" (which ones specifically?)
- ❌ Creating beads without source references

## Good Examples

✅ Bead with source traceability:

```
Source: C:\Users\matto\.claude\plans\auth-plan.md (Task 2)

Create POST /api/users endpoint that accepts {email, password}, validates
email format with regex ^[a-z]+@[a-z]+\.[a-z]{2,}$, hashes password with
bcrypt cost 12, stores in users table, returns 201 with {id, email} or
400 with {error: string}.

Files: src/routes/api/users/+server.ts
Dependencies: None
Acceptance: Unit tests pass, manual test with curl succeeds
```

✅ Another example:

```
Source: docs/specs/retry-logic.md

Add retry logic to fetchUserData(): max 3 attempts, exponential backoff
starting at 100ms, abort on 4xx errors, retry on 5xx and network errors,
throw RetryExhaustedError after final failure.

Files: src/lib/utils/api/fetchUserData.ts
Dependencies: None
Acceptance: Unit tests cover all retry scenarios
```

## Output

- Created beads listed with IDs
- Dependency graph if complex
- Any items requiring more specification flagged
- Confirmation that all beads reference source document
