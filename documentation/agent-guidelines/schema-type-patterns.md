# Schema & Validation Patterns (Zod)

## 1) Core Rules

- Use Zod to validate all external inputs: API request bodies, query params (after parsing), and any user-provided values.
- Prefer deriving TypeScript types from schemas with `z.infer<typeof schema>`.
- Keep schemas in `src/lib/schemas/**` (including `src/lib/schemas/ui/**` for reusable UI contracts).

## 2) When TypeScript Types Are OK

TypeScript-only `type`/`interface` is fine when runtime validation is not needed:

- Component-local, ephemeral UI state (defined inside a single file and not exported).
- Third-party types.
- Bridging types when a library's types are broader than our domain constraints (example: Better Auth user role typing in `src/lib/types/user.ts`).

## 3) Schema Definition Pattern

Example (Drive roles):

```ts
import { z } from 'zod';

export const userRoleSchema = z.enum(['driver', 'manager']);
export type UserRole = z.infer<typeof userRoleSchema>;
```

## 4) Server Pattern (API Endpoints)

Use `safeParse()` and fail fast:

```ts
import { json, error } from '@sveltejs/kit';
import { warehouseCreateSchema } from '$lib/schemas/warehouse';

export const POST = async ({ request }) => {
	const body = await request.json();
	const result = warehouseCreateSchema.safeParse(body);
	if (!result.success) {
		throw error(400, 'Validation failed');
	}

	// result.data is typed and validated
	return json({ ok: true });
};
```

## 5) Client Pattern (Forms)

Map `ZodError` to per-field arrays via `flatten().fieldErrors`:

```ts
const result = schema.safeParse({ name, address });

if (!result.success) {
	formErrors = result.error.flatten().fieldErrors;
	return;
}
```

## 6) PATCH / Update Schemas (No Defaults)

Defaults short-circuit parsing for `undefined`. For PATCH/update payloads:

- Define a separate update schema where all fields are optional.
- Do not use `.default()` in update schemas.

```ts
import { z } from 'zod';

export const warehouseCreateSchema = z.object({
	name: z.string().min(1),
	address: z.string().min(1)
});

export const warehouseUpdateSchema = z
	.object({
		name: z.string().min(1).optional(),
		address: z.string().min(1).optional()
	})
	.strict();
```
