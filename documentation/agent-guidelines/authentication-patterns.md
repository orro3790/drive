# Authentication Patterns (Better Auth)

Drive uses Better Auth for authentication and session management.

## 1) Where Auth Lives

- Better Auth config: `src/lib/server/auth.ts`
- SvelteKit integration + default-deny routing: `src/hooks.server.ts`

## 2) Locals You Can Rely On

`src/hooks.server.ts` populates these:

- `locals.session`: Better Auth session (if authenticated)
- `locals.user`: Better Auth user (if authenticated)
- `locals.userId`: convenience id (may be `undefined` when not authenticated)

## 3) Default-Deny Route Protection

- Public UI paths are allowlisted (see `publicPaths` in `src/hooks.server.ts`).
- Auth endpoints live under `/api/auth/*` (handled by `svelteKitHandler`).
- Unauthenticated:
  - UI routes redirect to `/sign-in?redirect=...`
  - API routes return `401` JSON

## 4) Role Guards

Role-based route groups enforce access in their layout server loads:

- Driver-only: `src/routes/(driver)/+layout.server.ts`
- Manager-only: `src/routes/(manager)/+layout.server.ts`
- Any authenticated user: `src/routes/(app)/+layout.server.ts`

For API endpoints, enforce roles explicitly:

```ts
import { error } from '@sveltejs/kit';

export const POST = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	if (locals.user.role !== 'manager') throw error(403, 'Forbidden');

	// ...
};
```

## 5) Domain User Typing

Better Auth's inferred types can be wider than the database constraints. For domain logic that needs a correct `role` type, use `src/lib/types/user.ts` (`asUser`, `UserRole`).
