# Windows Agent-Browser: Known Issues & Fixes

## 1. Shell Shim Fix (MSYS/Git Bash)

**Problem**: After `npm install -g agent-browser`, commands run but produce no output in MSYS/Git Bash.

**Cause**: npm generates a shell script shim that runs the CLI via `/bin/sh`. When bash executes this as a subprocess, stdout isn't captured properly.

**Fix**: Replace the shell script with a copy of the native executable:

```bash
rm "$APPDATA/npm/agent-browser"
ln -s "$APPDATA/npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe" "$APPDATA/npm/agent-browser"
```

**When to apply**: After any `npm install -g agent-browser` or `npm update -g agent-browser` (npm postinstall regenerates the broken shim).

## 2. Node spawn() Must NOT Use shell: true

**Problem**: When calling agent-browser from Node.js `child_process.spawn()` with `shell: true`, cmd.exe mangles arguments — especially JS expressions, URLs with `%xx` encoding, and glob patterns.

**Symptoms**:
- `wait --url **/` hangs or times out (cmd.exe glob confusion)
- `eval "Boolean(...)"` gets SyntaxError (cmd.exe strips/escapes quotes)
- `wait --fn "(() => ...)()"` gets SyntaxError (parentheses mangled)

**Fix**: Use the native exe path directly with `shell: false`:

```typescript
import path from 'node:path';

function resolveAgentBrowserExe(): string {
  const npmPrefix = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'npm')
    : path.join(process.env.HOME ?? '', '.npm-global');
  return path.join(npmPrefix, 'node_modules', 'agent-browser', 'bin',
    `agent-browser-${process.platform}-x64.exe`);
}

// Use this instead of spawn('agent-browser', args, { shell: true })
spawn(resolveAgentBrowserExe(), args, { windowsHide: true });
```

## 3. Prefer get count Over eval for Element Checks

**Problem**: Passing JS expressions to `eval` or `wait --fn` is fragile across platforms due to argument quoting.

**Fix**: Use built-in commands that take CSS selectors (simple strings, no JS):

```bash
# BAD — JS expression gets mangled by spawn/shell
agent-browser eval "Boolean(document.querySelector('[data-testid=\"foo\"]'))"

# GOOD — CSS selector passed as plain string
agent-browser get count "[data-testid=foo]"          # returns number
agent-browser wait "[data-testid=foo][data-loaded=true]"  # waits for element
```

## 4. wait --url Pattern Pitfalls

**Problem**: `wait --url "**/"`  hangs on Windows — the `**/` pattern doesn't match URLs that don't end with `/`.

**Fix**: Use specific patterns or poll `get url` instead:

```bash
# BAD — hangs
agent-browser wait --url "**/"

# GOOD — specific pattern
agent-browser wait --url "**/schedule"

# GOOD — poll in script
while true; do
  url=$(agent-browser get url)
  [[ "$url" != *"/sign-in"* ]] && break
  sleep 1
done
```

## 5. Stale Sessions After Crashes

**Problem**: If a script crashes mid-flow, the session stays registered in the daemon. Re-running with the same session name can get "browserContext.newPage: Target page, context or browser has been closed".

**Fix**: Always close sessions before reuse:

```bash
# Close specific session
agent-browser --session my-session close

# Or clean all sessions
agent-browser session list  # check what's active
agent-browser --session <name> close  # close each one
```

In scripts, add cleanup at startup:

```typescript
const { stdout } = await runProcess('agent-browser', ['session', 'list']);
for (const line of stdout.split('\n')) {
  const name = line.trim();
  if (name.startsWith('w-')) {
    await runProcess('agent-browser', ['--session', name, 'close']).catch(() => {});
  }
}
```

## 6. Daemon Failed to Start (socket: *.sock)

**Problem**: `Daemon failed to start (socket: C:\Users\...\.agent-browser\<session>.sock)` — this is intermittent on Windows when a previous daemon for that session name left stale state.

**Fix**: Delete stale PID/port/sock files:

```bash
rm -f "$USERPROFILE/.agent-browser/"*.pid "$USERPROFILE/.agent-browser/"*.port "$USERPROFILE/.agent-browser/"*.sock
```

Then retry. If it persists for a specific session name, use a different name.
