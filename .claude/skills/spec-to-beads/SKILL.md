---
name: spec-to-beads
description: Converts specifications or implementation plans into actionable BEADS with exhaustive implementation details and source traceability.
---

# Spec/Plan to Beads Skill

Convert product specifications or implementation plans into actionable BEADS.

Note: Use `bd` by default. If your shell has a Windows wrapper issue, temporarily use `bd.exe` with the same flags.

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
bd create "<clear title>" -d "<detailed body>"
```

### 2.5 Create an Umbrella Parent (REQUIRED for multi-bead plans)

If the source produces 3+ beads, create one parent epic/program bead first, then attach all generated beads as children.

```bash
bd create "Program: <spec title>" -t epic -p 1 -d "Source: <spec-file>\n\n<program objective + completion rule>"
```

This prevents partial/orphaned work and gives a single progress roll-up.

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
bd dep add <child-id> <parent-epic-id> -t parent-child
bd dep add <downstream-id> <prerequisite-id> -t blocks
```

Dependency rules:

1. **Hierarchy**: Every generated work bead must be attached to the umbrella epic with `-t parent-child`.
2. **Execution order**: Use `-t blocks` only for prerequisite sequencing among siblings.
3. **Never rely on default dep type** for parent grouping.

### 3.5 Validate Dependency Topology (REQUIRED)

Run validation commands immediately after dependency creation:

```bash
bd show <parent-epic-id>
bd epic status
```

The parent bead must display `Children (N)` with all generated beads.

### 4. Validate Completeness

For each bead, verify:

- [ ] Does it reference the source document?
- [ ] Can an agent implement this without asking questions?
- [ ] Are all file paths explicit?
- [ ] Are all function signatures defined?
- [ ] Are edge cases enumerated?
- [ ] Are error handling requirements specified?
- [ ] Are all generated beads attached to one umbrella parent via `parent-child`?
- [ ] Do sequencing dependencies use explicit `blocks` links where needed?

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
