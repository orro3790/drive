---
name: dev-server
description: Verifies the development server is running. User starts it manually.
---

# Dev Server

Port **5173** (from `package.json`).

## Check if Running

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "down"
```

- Returns `200` → Server is running, proceed
- Returns `down` or error → Server not running

## If Not Running

**Tell the user:**

> The dev server is not running on port 5173. Please start it in a separate terminal:
>
> ```bash
> pnpm dev
> ```
>
> Then let me know when it's ready.

**Do NOT attempt to start the server yourself.** Background processes in agent shells are unreliable.

## Why User-Started?

- Agent shells have stdin/TTY issues with long-running processes
- Orphaned server processes accumulate and bog down the system
- HMR works the same either way
- Server logs are visible in user's terminal
- Axiom captures server-side observability regardless

## Port Conflicts

If the server reports starting on 5181 instead of 5173, something is blocking the port:

```bash
netstat -ano | findstr :5173
# On Windows, kill via Task Manager or:
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
```
