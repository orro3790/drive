# Dev Server Notes

## Health Check

```bash
# Check for processes on port 5173
netstat -ano | findstr :5173

# Kill if found (get PID from netstat output, then)
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

# Broader check for any vite processes
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*vite*' }"
```

Run periodically if you suspect accumulating servers.

## Why User-Started Server?

As of 2026-01-29, agents no longer start the dev server themselves. Rationale:

1. **Reliability**: Agent shells have stdin/TTY issues causing `pnpm dev` to exit
2. **Resource leaks**: Agents forget to stop servers, causing accumulation
3. **Context reuse**: Persistent server works across multiple agent sessions
4. **Simpler**: One less failure mode in automated workflows

The previous `createServer()` workaround worked but added complexity. A user-started server is simpler and more reliable.

## Port Bumping

If you see the server start on 5181 instead of 5173, something is already on 5173. Always kill before starting:

```bash
powershell -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
```

Some features (like BetterAuth) require the exact port configured in `.env`.
