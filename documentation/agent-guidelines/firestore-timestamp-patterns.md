# Firestore Timestamp Patterns (Zod + serverTimestamp)

Status: LEGACY (copied from a previous project). Drive uses Postgres/Drizzle; do not apply these Firestore-specific timestamp rules.

## 1. Policy (normative)

- Write: persist authoritative times with Firestore `serverTimestamp()` (client) or Admin `FieldValue.serverTimestamp()` (server). Use a local optimistic `new Date()` only for immediate UI feedback.
- Read: coerce to `Date` in Zod using `z.preprocess(ensureDate, z.date())`, where `ensureDate` is provided by `src/lib/utils/date/firestore.ts`.
- Compare/sort: operate on `Date` objects (not raw `Timestamp`).
- Test: cover both the optimistic path and the server reconciliation from snapshots.

## 2. Implementation

### 2.1 Write with server timestamps

Client SDK example:

```ts
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

await updateDoc(doc(db, 'documents', id), {
	pinned: true,
	pinnedAt: serverTimestamp()
});
```

Server (Admin SDK) example:

```ts
import { FieldValue } from 'firebase-admin/firestore';

await ref.set(
	{
		updatedAt: FieldValue.serverTimestamp()
	},
	{ merge: true }
);
```

### 2.2 Read with Zod + ensureDate

```ts
import { z } from 'zod';
import { ensureDate } from '$lib/utils/date/firestore';

export const exampleSchema = z.object({
	createdAt: z.preprocess(ensureDate, z.date()),
	updatedAt: z.preprocess(ensureDate, z.date()).optional()
});
```

`ensureDate` accepts Firestore `Timestamp`, serialized `{ seconds, nanoseconds }` objects, dates, and strings, returning a valid `Date` when possible.

## 3. Optimistic UI pattern

- Set local UI state immediately with `new Date()`.
- Persist with `serverTimestamp()`.
- On snapshot, reconcile the field to the authoritative server time and clear any optimistic markers.

## 4. Testing checklist

- Unit: schema coercion with `ensureDate` for `Timestamp`, serialized objects, ISO strings, and nullables.
- Store: optimistic timestamp set, rollback on failure, reconciliation with server time.
- E2E: UI reflects immediate change, then reconciles to server value without jitter.

## 5. References

- `src/lib/utils/date/firestore.ts` (ensureDate)
- `firebase/firestore` and Admin SDK server timestamps
- code-review-standards.md (Timestamp Handling / Firestore)
