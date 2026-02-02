# Better Auth integration

Task: DRV-36d

## Steps

1. Review existing auth scaffolding and referenced docs to align with Better Auth requirements.
2. Configure Better Auth server in `src/lib/server/auth.ts` and populate `event.locals.user`/`event.locals.session`.
3. Implement auth guards in `src/hooks.server.ts` for page and API routes (redirect vs 401).
4. Build sign-in and sign-up pages, including invite code validation for drivers.
5. Create auth client in `src/lib/auth-client.ts` and smoke-check sign-in/up flow.

## Acceptance Criteria

- Users can sign up with email/password (drivers require invite code)
- Users can sign in and receive session cookie
- Protected routes redirect to /sign-in if not authenticated
- API routes return 401 if not authenticated
- Session available in event.locals.user and event.locals.session
- Role (driver/manager) accessible from session
