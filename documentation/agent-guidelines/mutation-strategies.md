# Mutation Strategies (Agent Guidelines)

Status: LEGACY (copied from a previous project). This document targets Firestore + an education domain model and is not currently applicable to Drive.

## Core principles

- Zod-first contracts: all inbound/outbound payloads validated; types inferred from schemas.
- Server-side tenancy: derive org context from session; reject unauthorized access.
- Transactional invariants: apply belongs-to checks and stamp snapshots within a single transaction.
- Structured errors: return normalized 4xx with codes; never leak PII; include requestId, orgId, actor.
- Locks: some mutations are gated by lock fields (e.g., documents after analysis; templates after first use).

### Ledgers vs snapshots (mental model)

- Ledgers (`Enrollment`, `TeachingAssignment`) answer **who was where and when**. They:
  - Represent time windows via `startDate`/`endDate|null` (or `isActive`).
  - Gate destructive mutations while a relationship is active (e.g., class/teacher delete).
  - Are the system of record for roster/assignment history and “current” membership.
- Snapshots (on `Document`, `Enrollment`, etc.) answer **what it looked like at the time**. They:
  - Carry minimal display fields (e.g., `{ id, name }`) stamped at a specific moment.
  - Protect against 404s and broken labels after source entities are renamed or deleted.
  - Never drive business invariants or blocking decisions by themselves.

Use ledgers for movement/assignments; use snapshots for artifact history and display safety.

## Why these patterns (rationales)

- Preserve referential integrity: Locks + transactional stamping ensure we never leave half-mutated associations or dangling references.
- Predictable UX: “Duplicate to edit” for templates and “create new class + move students” for renames create a simple mental model and avoid silent drift.
- Historical fidelity without heavy joins: Minimal snapshots on Documents allow stable, printable history even if the source is later deleted.
- Firestore realities: No cross-collection cascading transactions; uniqueness is best enforced via deterministic “claim” docs; transactions handle races.
- Cost/performance: Client views prefer live names; snapshots are only a safety fallback. Claims add O(1) tiny docs and prevent expensive global scans.
- Auditability: Ledgers (Enrollment/TeachingAssignment) are the system of record for movement windows; documents reference those states rather than trying to reconstruct timelines post hoc.

## Anti-patterns to avoid (and why)

- In-place rename of classes with enrollments: breaks history; use “new class + move students” to preserve enrollment windows.
- Editing a template after analysis without duplication: causes analysis drift; snapshots won’t match mutated schema.
- Live-only historical display: fails when referenced docs are deleted; stamp minimal snapshots for safety.
- Global uniqueness scans: expensive and racy; use deterministic claim docs with transactions.
- Trusting client-provided orgId: creates cross-tenant leaks; always derive tenancy server-side.

## Standard error codes (mutation)

- NAME_TAKEN (409): unique name claim already exists.
- DOC_LOCKED (409): document is bonded to a template/analysis; template changes require revert first.
- ORG*MISMATCH* (409): selected foreign keys disagree on org scope; never “self-heal” across orgs.
- INVALID_ARGUMENT (400), FORBIDDEN (403), NOT_FOUND (404) as usual.

## Name uniqueness

All collections that enforce unique names use the **claim document pattern**. This provides race-free, transaction-safe uniqueness enforcement.

### Quick reference

| Collection          | Unique? | Scope          | Claim Collection           |
| ------------------- | ------- | -------------- | -------------------------- |
| **Templates**       | ✅ Yes  | Per owner/org  | `template_name_claims`     |
| **Classes**         | ✅ Yes  | Per org        | `class_name_claims`        |
| **Materials**       | ✅ Yes  | Per org        | `material_name_claims`     |
| **Curricula**       | ✅ Yes  | Per org        | `curriculum_name_claims`   |
| **Subjects**        | ✅ Yes  | Per curriculum | `subject_name_claims`      |
| **LessonTemplates** | ❌ No   | —              | — (`sequenceNumber` is ID) |
| **Students**        | ❌ No   | —              | — (duplicates expected)    |

### Decision framework

**Enforce uniqueness when:**

1. Entity is a **named reference target** (templates, classes, curricula, materials)
2. Staff/parents **coordinate by name** ("enroll in Math 101", "use Essay Rubric")
3. Duplicate names cause **operational confusion**

**Skip uniqueness when:**

1. Entity has a **better identifier** (sequenceNumber, serialNumber, ID)
2. **Duplicates are expected** (students with same names)
3. Entity is an **instance**, not a catalogue entry (MaterialAssignments, not Materials)

### Claim document pattern

All unique-name collections use the same pattern:

```
Collection: {entity}_name_claims
Doc ID: {ownerKey}:{nameLower}
```

**Implementation** (see `nameClaimsService.ts`):

```typescript
// CREATE: claim + entity in one transaction
await db.runTransaction(async (tx) => {
	const claimSnap = await tx.get(claimRef);
	if (claimSnap.exists) throw new Error('NAME_TAKEN');

	tx.set(claimRef, buildClaimDocData({ ownerId, nameLower, targetId }));
	tx.set(entityRef, entity);
});

// RENAME: new claim → update entity → delete old claim
await db.runTransaction(async (tx) => {
	const newClaimSnap = await tx.get(newClaimRef);
	if (newClaimSnap.exists) throw new Error('NAME_TAKEN');

	tx.set(newClaimRef, buildClaimDocData({ ownerId, nameLower: newNameLower, targetId }));
	tx.update(entityRef, updates);
	tx.delete(oldClaimRef);
});

// DELETE: entity + claim together
await db.runTransaction(async (tx) => {
	tx.delete(entityRef);
	tx.delete(claimRef);
});
```

**Why claim docs (not query-based)?**

- **Race-free**: Firestore transactions guarantee only one claim succeeds
- **O(1) lookup**: No collection scans
- **Enterprise-grade**: No edge cases, no "acceptable risk"
- **Simple mental model**: One pattern for everything

### Notes

- Use case-insensitive comparison via `nameLower` (normalized with `normalizeForPrefix`).
- Conflicts return `409 NAME_TAKEN`.
- Subjects are scoped to curriculum (or org if standalone) — see `buildSubjectScopeKey`.

## Resource-specific policies

### Templates

- Before first analysis
  - Fully mutable by owner; name must be unique per owner (claim docs).
  - Edits persist nameLower for prefix search.
- After first analysis
  - Template is locked (lockedAt set on first analysis).
  - Allowed while locked: non-structural toggles (e.g., pinned/isActive). Block structural/name edits.
  - Preferred path to change: Duplicate the template, then edit the copy.
- Documents referencing templates
  - Documents stamp assignmentTemplateSnapshot at creation or when locked without a snapshot.
  - Views prefer live template label; fall back to snapshot if template is missing.
  - To change the template for a document that already has analysis: revert the document (clears analyses and template association).

### Classes

- Names are unique per org (claim docs). If you need term-specific uniqueness, incorporate term into the key.
- Rename policy with enrollments
  - Block in-place renames when enrollments exist. Treat it as “create new class + move students.”
  - Movement uses Enrollment ledger (close old with endDate, open new with startDate) in one transaction.
- Allowed edits anytime: description, photo, metadata that do not break invariants.
- Deletion
  - Allowed only when there are **no active ledgers**: no `Enrollment` with `endDate == null` and no `TeachingAssignment` with `isActive == true` for that class.
  - **Documents do not block class deletion**. Documents keep `classId` plus `classSnapshot` for historical display; ledgers remain the source of truth for “who was in this class and when.”

### Students

- Mutable profile (name, photo, metadata). Names are live; no uniqueness enforced.
- Movement between classes
  - Use Enrollment ledger: set endDate on the current enrollment, create a new enrollment for the target class. Perform atomically in a transaction.
- Deletion handled by deletion-strategies; mutation here does not use locks.

### Documents

- Rename (documentName): allowed.

- Association changes (classId/studentId)
  - Treated as attribution corrections, not content changes. **Allowed even when analysis exists**, as long as org/tenancy checks pass.
  - On change, stamp `classSnapshot` / `studentSnapshot` transactionally and enforce org consistency.
  - Snapshots are minimal and used as fallbacks if the referenced records are later deleted. UIs **must** use “live entity or snapshot fallback,” not assume the foreign key is always resolvable. Prefer the helpers in `$lib/utils/documents/display.ts` (e.g., `getDocumentClassLabel`, `getDocumentStudentLabel`, `getDocumentTemplateLabel`) instead of inlining this logic.

- Snapshot lifecycle (text)
  - Stamp an initial text snapshot on **document creation** (raw intake).
  - On the **first** “Run analysis” request, overwrite that snapshot with the cleaned text at that moment (teacher‑approved, ready‑for‑analysis state).
  - **Never** overwrite this snapshot again on subsequent analyses or suggestion passes; Revert always returns to this state.
  - Implementation: store the snapshot in `document_initial_states` and reference it from `Document` via `revertSnapshotRef` / `revertSnapshotStage`.

- Template bond
  - Once a document has analysis, it is **bonded** to its current `assignmentTemplateId` and text snapshot.
  - Template changes are allowed only:
    - Before any analysis has run, or
    - After an explicit Revert that clears analysis and breaks the bond.

- Template selection
  - Allowed before analysis.
  - To change the template **after** analysis, callers must go through Revert (server clears analysis + template bond, then allows a new template to be set). Attempts to bypass this should return `409 DOC_LOCKED`.

### Enrollments (student ↔ class)

- Ledger-only edits:
  - To end: set endDate (leave startDate untouched).
  - To change class: close current enrollment (set endDate) and create a new one (new classId, startDate). Do both in a transaction.
- Snapshot field
  - classSnapshot { id, name } is captured on creation (or close if missing) for display safety when class is deleted later. Active views resolve via live classId.

### TeachingAssignments (teacher ↔ class)

- Use isActive or endDate to represent active windows (no string status).
- Mutations are confined to starting/ending windows; audit via timestamps.

## Implementation notes

- Transactions
  - Use runTransaction for multi-write operations: belongs-to checks → writes → snapshot stamping.
  - For claim docs: create claim first, then write the resource; on rename, write new claim → update resource → delete old claim.

- Tenancy
  - Resolve orgId from class/student in the same transaction for document associations; adopt orgId if missing; block on mismatch.

- UI guidance
  - Locked template: show a badge and “Duplicate to edit” action.
  - Locked document: show a clear message; allow “Revert to original” to clear analyses and template.
  - Name conflicts (templates/classes): show “Name already in use” with a suggestion to suffix (e.g., “v2”).

## FAQs

- Why can’t I edit this template?
  - It’s locked because at least one document used it for analysis. Duplicate to make changes.

- Why can’t I rename this class?
  - Classes with enrollments are historical containers; to rename, create a new class and move students atomically.

- Why did my document association change get rejected?
  - The document is locked or the selected class/student belongs to a different org. Unlock or fix the selection; revert if you need to change the template.

- Why do documents show old class/student names?
  - They use minimal snapshots as fallbacks when the source is missing. Active views use live names.
