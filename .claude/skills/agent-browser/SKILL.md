---
name: agent-browser
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Windows Setup (one-time)

After installing agent-browser, fix the bash shim:

```bash
rm "$APPDATA/npm/agent-browser"
ln -s "$APPDATA/npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe" "$APPDATA/npm/agent-browser"
```

This replaces npm's broken shell script shim with a symlink to the native executable.

## Quick start

```bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
```

## Cleanup (REQUIRED)

`close` only closes the browser window—the daemon process stays alive. **Always kill the daemon when done:**

```bash
pwsh -Command "Get-Process node | Where-Object {\$_.CommandLine -like '*agent-browser*daemon*'} | Stop-Process -Force"
```

## Core workflow

1. Navigate: `agent-browser open <url>`
2. Snapshot: `agent-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation

```bash
agent-browser open <url>      # Navigate to URL
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser close           # Close browser
```

### Snapshot (page analysis)

```bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -c         # Compact output
agent-browser snapshot -d 3       # Limit depth to 3
agent-browser snapshot -s "#main" # Scope to CSS selector
```

### Interactions (use @refs from snapshot)

```bash
agent-browser click @e1           # Click
agent-browser dblclick @e1        # Double-click
agent-browser focus @e1           # Focus element
agent-browser fill @e2 "text"     # Clear and type
agent-browser type @e2 "text"     # Type without clearing
agent-browser press Enter         # Press key
agent-browser press Control+a     # Key combination
agent-browser keydown Shift       # Hold key down
agent-browser keyup Shift         # Release key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser uncheck @e1         # Uncheck checkbox
agent-browser select @e1 "value"  # Select dropdown
agent-browser scroll down 500     # Scroll page
agent-browser scrollintoview @e1  # Scroll element into view
agent-browser drag @e1 @e2        # Drag and drop
agent-browser upload @e1 file.pdf # Upload files
```

### Get information

```bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get count ".item"   # Count matching elements
agent-browser get box @e1         # Get bounding box
```

### Check state

```bash
agent-browser is visible @e1      # Check if visible
agent-browser is enabled @e1      # Check if enabled
agent-browser is checked @e1      # Check if checked
```

### Screenshots & PDF

```bash
agent-browser screenshot          # Screenshot to stdout
agent-browser screenshot path.png # Save to file
agent-browser screenshot --full   # Full page
agent-browser pdf output.pdf      # Save as PDF
```

### Video recording

```bash
agent-browser record start ./demo.webm    # Start recording (uses current URL + state)
agent-browser click @e1                   # Perform actions
agent-browser record stop                 # Stop and save video
agent-browser record restart ./take2.webm # Stop current + start new recording
```

Recording creates a fresh context but preserves cookies/storage from your session. If no URL is provided, it automatically returns to your current page. For smooth demos, explore first, then start recording.

### Wait

```bash
agent-browser wait @e1                     # Wait for element
agent-browser wait 2000                    # Wait milliseconds
agent-browser wait --text "Success"        # Wait for text
agent-browser wait --url "**/dashboard"    # Wait for URL pattern
agent-browser wait --load networkidle      # Wait for network idle
agent-browser wait --fn "window.ready"     # Wait for JS condition
```

### Mouse control

```bash
agent-browser mouse move 100 200      # Move mouse
agent-browser mouse down left         # Press button
agent-browser mouse up left           # Release button
agent-browser mouse wheel 100         # Scroll wheel
```

### Semantic locators (alternative to refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find first ".item" click
agent-browser find nth 2 "a" text
```

### Browser settings

```bash
agent-browser set viewport 1920 1080      # Set viewport size
agent-browser set device "iPhone 14"      # Emulate device
agent-browser set geo 37.7749 -122.4194   # Set geolocation
agent-browser set offline on              # Toggle offline mode
agent-browser set headers '{"X-Key":"v"}' # Extra HTTP headers
agent-browser set credentials user pass   # HTTP basic auth
agent-browser set media dark              # Emulate color scheme
```

### Cookies & Storage

```bash
agent-browser cookies                     # Get all cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies
agent-browser storage local               # Get all localStorage
agent-browser storage local key           # Get specific key
agent-browser storage local set k v       # Set value
agent-browser storage local clear         # Clear all
```

### Network

```bash
agent-browser network route <url>              # Intercept requests
agent-browser network route <url> --abort      # Block requests
agent-browser network route <url> --body '{}'  # Mock response
agent-browser network unroute [url]            # Remove routes
agent-browser network requests                 # View tracked requests
agent-browser network requests --filter api    # Filter requests
```

### Tabs & Windows

```bash
agent-browser tab                 # List tabs
agent-browser tab new [url]       # New tab
agent-browser tab 2               # Switch to tab
agent-browser tab close           # Close tab
agent-browser window new          # New window
```

### Frames

```bash
agent-browser frame "#iframe"     # Switch to iframe
agent-browser frame main          # Back to main frame
```

### Dialogs

```bash
agent-browser dialog accept [text]  # Accept dialog
agent-browser dialog dismiss        # Dismiss dialog
```

### JavaScript

```bash
agent-browser eval "document.title"   # Run JavaScript
```

## Example: Form submission

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```

## Example: Authentication with auto-persistence

```bash
# Login once — --session-name auto-saves cookies & localStorage
agent-browser --session myapp --session-name myapp open https://app.example.com/login
agent-browser --session myapp snapshot -i
agent-browser --session myapp fill @e1 "username"
agent-browser --session myapp fill @e2 "password"
agent-browser --session myapp click @e3
agent-browser --session myapp wait --url "**/dashboard"
# State is auto-saved — no manual state save needed

# Later sessions: state auto-restores from --session-name
agent-browser --session myapp --session-name myapp open https://app.example.com/dashboard
```

## Sessions (IMPORTANT for isolation)

**Always use named sessions** when running multiple browser instances or working in parallel with other agents/terminals. Each session has its own browser instance, cookies, storage, and auth state.

Two session flags — use both together:

- `--session <name>` — process isolation (separate browser instance)
- `--session-name <name>` — auto-persistence (cookies & localStorage survive restarts)

```bash
# Use both flags: isolation + auto-persistence
agent-browser --session driver-ops --session-name driver-ops open http://localhost:5173 --headed

# All subsequent commands use the same session
agent-browser --session driver-ops snapshot -i
agent-browser --session driver-ops click @e1

# List active sessions
agent-browser session list
```

**Why this matters:** Without `--session`, all agent-browser commands share the "default" session. If you have multiple terminals or agents running browser tests on different ports/projects, they'll collide and cause "Page crashed" or "Browser not launched" errors.

## Auth Persistence (via --session-name)

With `--session-name`, cookies and localStorage are **automatically saved and restored** across browser restarts. No manual `state save`/`state load` needed.

```bash
# First time: login normally — state auto-saves after login
agent-browser --session driver-ops --session-name driver-ops open http://localhost:5173/sign-in --headed

# Next session: state auto-restores — you're already logged in
agent-browser --session driver-ops --session-name driver-ops open http://localhost:5173/ --headed
```

Include `--session-name driver-ops` on the `open` command to trigger auto-restore.

### Stale Auth Detection

If after opening you land on `/sign-in` instead of the expected route:

```bash
# Session expired - clear persisted state and re-auth
agent-browser --session driver-ops cookies clear
# Then run /dev-login
```

### Managing Persisted Sessions

```bash
agent-browser session list            # List all saved sessions
```

## JSON output (for parsing)

Add `--json` for machine-readable output:

```bash
agent-browser snapshot -i --json
agent-browser get text @e1 --json
```

## Windows Scripting Rules (CRITICAL for Node.js automation)

When calling agent-browser from Node.js scripts (`child_process.spawn`), these rules prevent hours of debugging:

### 1. NEVER use shell: true

cmd.exe mangles JS expressions, URLs with `%xx`, and glob patterns. Use the native exe directly:

```typescript
import path from 'node:path';

// Resolve the native exe — bypasses cmd.exe entirely
const exe = path.join(process.env.APPDATA!, 'npm', 'node_modules',
  'agent-browser', 'bin', 'agent-browser-win32-x64.exe');
spawn(exe, ['--session', name, 'open', url], { windowsHide: true });
// NOT: spawn('agent-browser', args, { shell: true })  // BROKEN
```

### 2. Use get count / wait CSS selectors, NOT eval

`eval` and `wait --fn` pass JS expressions as arguments — these break across platforms due to quoting.

```bash
# BAD — JS expression gets mangled
agent-browser eval "Boolean(document.querySelector('[data-testid=\"foo\"]'))"

# GOOD — CSS selector as a plain string
agent-browser get count "[data-testid=foo]"                    # returns number
agent-browser wait "[data-testid=foo][data-loaded=true]"       # waits for match
```

### 3. Do NOT use wait --url with broad globs

`wait --url "**/"`  hangs on Windows. Use specific patterns or poll `get url`:

```bash
# BAD — hangs
agent-browser wait --url "**/"
# GOOD
agent-browser wait --url "**/schedule"
```

### 4. Clean up stale sessions before reuse

Crashed scripts leave sessions registered in the daemon. Always close before restarting:

```bash
agent-browser session list                    # check what's active
agent-browser --session <name> close          # close each stale one
```

### 5. Clear stale daemon files if daemon won't start

If you see `Daemon failed to start (socket: *.sock)`:

```bash
rm -f "$USERPROFILE/.agent-browser/"*.pid "$USERPROFILE/.agent-browser/"*.port "$USERPROFILE/.agent-browser/"*.sock
```

## Debugging

```bash
agent-browser open example.com --headed              # Show browser window
agent-browser console                                # View console messages
agent-browser errors                                 # View page errors
agent-browser record start ./debug.webm   # Record from current page
agent-browser record stop                            # Save recording
agent-browser --cdp 9222 snapshot        # Connect via CDP
agent-browser console --clear            # Clear console
agent-browser errors --clear             # Clear errors
agent-browser highlight @e1              # Highlight element
agent-browser trace start                # Start recording trace
agent-browser trace stop trace.zip       # Stop and save trace
```
