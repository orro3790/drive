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
# Use seeded test users (see Credentials section)
agent-browser --session driver-ops fill @e3 "driver009@driver.test"
agent-browser --session driver-ops fill @e5 "test1234"
agent-browser --session driver-ops click @e6
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

### Seeded Test Users (Recommended)

Run `pnpm seed:staging` to populate the database with 100 drivers and 5 managers.

**All seeded users share the same password:** `test1234`

**Email format** (increment number for different users):

- Drivers: `driver001@driver.test` through `driver100@driver.test`
- Managers: `manager001@drivermanager.test` through `manager005@drivermanager.test`

**Examples:**

```
driver009@driver.test / test1234    # Driver login
manager001@drivermanager.test / test1234   # Manager login
```

**Development only** — not real user data.

### Invite Code (for sign-up)

`drive-2026`

## Creating a Test User

Prefer using `pnpm seed:staging` to create seeded users. If you need a custom user:

```bash
curl -X POST http://localhost:5173/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "x-invite-code: drive-2026" \
  -d '{"email":"custom@driver.test","password":"test1234","name":"Custom Driver"}'
```

**Note:** The invite code must be sent as a header, not in the body.

## Prerequisites

The dev server must be running on localhost:5173. Use `/dev-server` to verify.
