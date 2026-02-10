---
name: dev-login
description: Automates login to the development server. Persists auth state for reuse across sessions.
---

# Dev Login Automation

Log into the Driver Ops development server using agent-browser.

**IMPORTANT**: Use the credentials below. Do NOT read `.env` or other config files for credentials.

## Auth State File

Location: `.agent-browser/driver-ops-auth.json` (gitignored)

## Workflow

### 1. Try Loading Saved Auth

```bash
agent-browser --session driver-ops state load .agent-browser/driver-ops-auth.json 2>/dev/null
```

If file exists and loads successfully, skip to step 6 (verify auth).

### 2. Navigate to Login Page

```bash
agent-browser --session driver-ops open http://localhost:5173/sign-in --headed
```

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

### 5. Save Auth State

After successful login:

```bash
agent-browser --session driver-ops state save .agent-browser/driver-ops-auth.json
```

### 6. Verify Auth Works

Navigate to a protected route:

```bash
agent-browser --session driver-ops open http://localhost:5173/ --headed
agent-browser --session driver-ops get url
```

- If URL is `/` or a protected route → Auth valid
- If URL contains `/sign-in` → Auth expired, clear and retry

## Stale Session Recovery

If you load saved auth but get redirected to sign-in:

```bash
# Clear stale state
agent-browser --session driver-ops cookies clear
powershell -Command "Remove-Item '.agent-browser/driver-ops-auth.json' -ErrorAction SilentlyContinue"

# Re-login (steps 2-5)
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
