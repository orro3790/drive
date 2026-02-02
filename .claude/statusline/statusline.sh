#!/bin/bash
# Catppuccin Mocha Theme Statusline for Ralph Loop
# Color reference: https://github.com/catppuccin/catppuccin

# Catppuccin Mocha palette (ANSI 256-color codes)
MOCHA_ROSEWATER="\033[38;5;217m"  # #f5e0dc
MOCHA_FLAMINGO="\033[38;5;211m"   # #f2cdcd
MOCHA_PINK="\033[38;5;212m"       # #f5c2e7
MOCHA_MAUVE="\033[38;5;183m"      # #cba6f7
MOCHA_RED="\033[38;5;203m"        # #f38ba8
MOCHA_MAROON="\033[38;5;168m"     # #eba0ac
MOCHA_PEACH="\033[38;5;216m"      # #fab387
MOCHA_YELLOW="\033[38;5;221m"     # #f9e2af
MOCHA_GREEN="\033[38;5;151m"      # #a6e3a1
MOCHA_TEAL="\033[38;5;116m"       # #94e2d5
MOCHA_SKY="\033[38;5;117m"        # #89dceb
MOCHA_SAPPHIRE="\033[38;5;110m"   # #74c7ec
MOCHA_BLUE="\033[38;5;111m"       # #89b4fa
MOCHA_LAVENDER="\033[38;5;147m"   # #b4befe
MOCHA_TEXT="\033[38;5;252m"       # #cdd6f4
MOCHA_SUBTEXT1="\033[38;5;245m"   # #bac2de
MOCHA_SUBTEXT0="\033[38;5;243m"   # #a6adc8
MOCHA_OVERLAY2="\033[38;5;241m"   # #9399b2
MOCHA_OVERLAY1="\033[38;5;239m"   # #7f849c
MOCHA_OVERLAY0="\033[38;5;237m"   # #6c7086
MOCHA_SURFACE2="\033[38;5;235m"   # #585b70
MOCHA_SURFACE1="\033[38;5;234m"   # #45475a
MOCHA_SURFACE0="\033[38;5;233m"   # #313244
MOCHA_BASE="\033[38;5;232m"       # #1e1e2e
MOCHA_MANTLE="\033[38;5;231m"     # #181825
MOCHA_CRUST="\033[38;5;230m"      # #11111b
RESET="\033[0m"

# Read JSON input from Claude Code
input=$(cat)

# Extract statusline data
STATUS=$(echo "$input" | jq -r '.status')
CURRENT_DIR=$(echo "$input" | jq -r '.workspace.current_dir')
MODEL=$(echo "$input" | jq -r '.model.display_name')

# Extract worktree name from path
WORKTREE_NAME=$(basename "$CURRENT_DIR")

# Parse debug-prompt.txt to extract iteration info from Ralph
RALPH_PROMPT_FILE="$CURRENT_DIR/ralph/debug-prompt.txt"
if [ -f "$RALPH_PROMPT_FILE" ]; then
  ITERATION=$(grep -oP 'iteration \K\d+' "$RALPH_PROMPT_FILE" | head -1)
  MAX_ITERATIONS=$(grep -oP 'of \K\d+' "$RALPH_PROMPT_FILE" | head -1)
  TASK_ID=""

  # Try to read task from status file
  STATUS_FILE="$CURRENT_DIR/ralph/.current-task"
  if [ -f "$STATUS_FILE" ]; then
    TASK_ID=$(cat "$STATUS_FILE" | cut -d'|' -f1 | tr -d ' ')
  fi

  # Try to read task from CLAUDE.local.md if status file doesn't exist
  if [ -z "$TASK_ID" ] && [ -f "$CURRENT_DIR/CLAUDE.local.md" ]; then
    TASK_ID=$(grep -oP 'Task:\s*\K\S+' "$CURRENT_DIR/CLAUDE.local.md" | head -1)
  fi

  # Try to read i18n status from CLAUDE.local.md
  I18N_STATUS=""
  if [ -f "$CURRENT_DIR/CLAUDE.local.md" ]; then
    I18N_LINE=$(grep -i "i18n:" "$CURRENT_DIR/CLAUDE.local.md" | head -1)
    if [ -n "$I18N_LINE" ]; then
      I18N_STATUS=$(echo "$I18N_LINE" | sed 's/.*i18n://i' | tr -d ' ')
    fi
  fi
else
  ITERATION=""
  MAX_ITERATIONS=""
  TASK_ID=""
  I18N_STATUS=""
fi

# Format status with color based on current state
case "$STATUS" in
  "running")
    STATUS_COLOR="${MOCHA_GREEN}"
    STATUS_LABEL="RUNNING"
    ;;
  "waiting_input")
    STATUS_COLOR="${MOCHA_YELLOW}"
    STATUS_LABEL="WAITING"
    ;;
  "error")
    STATUS_COLOR="${MOCHA_RED}"
    STATUS_LABEL="ERROR"
    ;;
  *)
    STATUS_COLOR="${MOCHA_BLUE}"
    STATUS_LABEL="$STATUS"
    ;;
esac

# Build statusline parts
PARTS=()

# Status (green/yellow/red)
PARTS+=("${STATUS_COLOR}${STATUS_LABEL}${RESET}")

# Worktree (sapphire blue)
PARTS+=("${MOCHA_SAPPHIRE}${WORKTREE_NAME}${RESET}")

# Model (mauve)
PARTS+=("${MOCHA_MAUVE}${MODEL}${RESET}")

# Iteration info (teal) - only if Ralph is active
if [ -n "$ITERATION" ] && [ -n "$MAX_ITERATIONS" ]; then
  PARTS+=("${MOCHA_TEAL}Iter: ${ITERATION}/${MAX_ITERATIONS}${RESET}")
fi

# Task ID (peach) - only if present
if [ -n "$TASK_ID" ]; then
  PARTS+=("${MOCHA_PEACH}Task: ${TASK_ID}${RESET}")
fi

# I18n status (lavender) - only if present
if [ -n "$I18N_STATUS" ]; then
  PARTS+=("${MOCHA_LAVENDER}I18n: ${I18N_STATUS}${RESET}")
fi

# Join parts with subtext-colored separators
OUTPUT=""
for i in "${!PARTS[@]}"; do
  if [ $i -gt 0 ]; then
    OUTPUT+="${MOCHA_SUBTEXT0} | ${RESET}"
  fi
  OUTPUT+="${PARTS[$i]}"
done

echo -e "$OUTPUT"
