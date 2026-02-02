# Windows Shim Fix

## The Problem

After `npm install -g agent-browser`, commands run but produce no output in MSYS/Git Bash:

```bash
agent-browser get url  # Runs successfully but no output shown
```

## Why It Happens

npm generates a shell script shim that runs the CLI via `/bin/sh`. When bash executes this script as a subprocess, stdout isn't captured properly.

## The Fix

Replace the shell script with a symlink to the native executable:

```bash
rm "$APPDATA/npm/agent-browser"
ln -s "$APPDATA/npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe" "$APPDATA/npm/agent-browser"
```

## When To Apply

After any:

- `npm install -g agent-browser`
- `npm update -g agent-browser`

The npm postinstall regenerates the broken shim, so reapply this fix.
