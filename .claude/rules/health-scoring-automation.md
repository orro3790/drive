# Health, Scoring & Automation Rule

When working on any task involving driver health, scoring, metrics, flagging, cron jobs, bid windows, shift lifecycle, or automated systems:

1. **Start by reading** `documentation/agent-guidelines/health-and-automation-quickref.md`
2. This single file contains: point values, cron schedule, shift lifecycle stages, bid scoring formula, flagging thresholds, notification types, and all configuration values.
3. For implementation details, follow the source file links in the quick-reference.
4. All configurable values live in `src/lib/config/dispatchPolicy.ts` — never hardcode thresholds.
