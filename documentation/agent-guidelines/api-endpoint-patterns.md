# API Endpoint Patterns (SvelteKit)

Standard patterns for SvelteKit API endpoints (`+server.ts`).

## 1) Principles

- Fail fast on auth and role checks.
- Validate request bodies with Zod (`safeParse`).
- Keep responses predictable (JSON shapes, status codes).
- Prefer stable server error messages/codes; user-facing copy should live in the UI (Paraglide).

## 2) Auth + Role Checks

All endpoints should start with:

```ts
import { error } from '@sveltejs/kit';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw error(401, 'Unauthorized');
	return locals.user;
}

function requireManager(locals: App.Locals) {
	const user = requireUser(locals);
	if (user.role !== 'manager') throw error(403, 'Forbidden');
	return user;
}
```

(Inline the checks if you prefer; avoid over-abstracting early.)

## 3) Request Validation

```ts
import { error } from '@sveltejs/kit';
import { warehouseCreateSchema } from '$lib/schemas/warehouse';

const body = await request.json();
const result = warehouseCreateSchema.safeParse(body);
if (!result.success) {
	throw error(400, 'Validation failed');
}
```

For client-side inline errors, prefer validating in the UI before calling the API (see `documentation/agent-guidelines/error-handling-protocol.md`).

## 4) Database Access (Drizzle)

- Use Drizzle via `src/lib/server/db/`.
- Use transactions when multiple writes must succeed together.

## 5) Response + Status Codes

- `200` success
- `201` created
- `400` validation failed
- `401` unauthenticated
- `403` unauthorized
- `404` not found
- `500` unexpected server error

Return JSON via `json(...)`.

## 6) Logging

Use `src/lib/server/logger.ts` for unexpected errors and for important state transitions.

```ts
import logger, { createContextLogger } from '$lib/server/logger';

const log = createContextLogger({ op: 'createWarehouse', userId: locals.userId });
log.info({ warehouseId: created.id }, 'Warehouse created');
```

Do not log secrets/PII.

## 7) Reference Examples

- Warehouses: `src/routes/api/warehouses/+server.ts`
- Routes: `src/routes/api/routes/+server.ts`
