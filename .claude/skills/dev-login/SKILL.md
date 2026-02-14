---
name: dev-login
description: Automates login to the development server. Persists auth state for reuse across sessions.
---

# Dev Login Automation

Log into the Driver Ops development server using agent-browser.

**IMPORTANT**: Use the credentials below. Do NOT read `.env` or other config files for credentials.

## Workflow

Auth state auto-persists via `--session-name`. No manual save/load needed.

### 1. Open App (auto-restores auth if previously logged in)

```bash
agent-browser --session driver-ops --session-name driver-ops open http://localhost:5173/ --headed
```

### 2. Check If Already Authenticated

```bash
agent-browser --session driver-ops get url
```

- If URL is `/` or a protected route → Auth valid, done!
- If URL contains `/sign-in` → Need to login, continue to step 3

### 3. Take Snapshot

```bash
agent-browser --session driver-ops snapshot -i
```

Look for:

- Email input: `type="email"`
- Password input: `type="password"`
- Submit button: Contains "Sign in" text

### 4. Fill and Submit Login Form

```bash
agent-browser --session driver-ops fill @e1 "justin.myddp@proton.me"
agent-browser --session driver-ops fill @e2 "test1234"
agent-browser --session driver-ops click @e3
agent-browser --session driver-ops wait --url "**/"
```

Auth state auto-saves via `--session-name`. Next session will auto-restore.

### 5. Verify

```bash
agent-browser --session driver-ops get url
```

Confirm URL is `/` or a protected route (not `/sign-in`).

## Stale Session Recovery

If auth auto-restores but you still get redirected to sign-in:

```bash
# Clear persisted state and re-login
agent-browser --session driver-ops cookies clear
# Re-login (steps 1-4 — open with --session-name, fill form)
```

## Credentials

### Manager Credentials (Real)

- Email: `justin.myddp@proton.me`
- Password: `test1234`
- Invite code (for sign-up): `drive-2026`

### Seeded Test Users

Run `pnpm seed:staging` to populate the database with 100 drivers and 5 managers.

**All seeded users share the same password:** `test1234`

Seeded emails use test domains:

- Drivers: `*@driver.test`
- Managers: `*@drivermanager.test`

To find seeded user emails, query the database:

```sql
SELECT email FROM "user" WHERE email LIKE '%@driver.test' LIMIT 5;
SELECT email FROM "user" WHERE email LIKE '%@drivermanager.test';
```

Or check the seed script output after running `pnpm seed` or `pnpm seed:staging`.

**Development only** — not real user data.

## Creating a Test User

If no user exists, sign up first. **Note:** The invite code must be sent as a header, not in the body.

```bash
curl -X POST http://localhost:5173/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "x-invite-code: drive-2026" \
  -d '{"email":"justin.myddp@proton.me","password":"test1234","name":"Test Manager"}'
```

If the user already exists and you need to reset the password, update directly in the database:

```bash
# Generate a new hash (using better-auth's expected format)
# Or delete and recreate the user:
curl -X POST http://localhost:5173/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "x-invite-code: drive-2026" \
  -d '{"email":"NEW_EMAIL","password":"NEW_PASSWORD","name":"Test Manager"}'
```

## Prerequisites

The dev server must be running on localhost:5173. Use `/dev-server` to verify.
