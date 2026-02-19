# Notifications: include shift date/time context (in-app + push)

Task: DRV-hfh.3

## Steps

1. Inventory all shift-related notification send paths (template-based and `customBody` call sites) and map each in-scope type to its emitter file and available date/time fields.
2. For each in-scope type, add `assignmentDate` and `routeStartTime` to persisted `notifications.data` (or document/implement a safe fallback when only one value is available).
3. Update message construction where it actually occurs: adjust template text in `src/lib/server/services/notifications.ts` for template-driven types and update `customBody`/title builders at call sites for custom-message types so push/in-app text includes human-readable shift date/time.
4. Update `src/lib/components/notifications/NotificationItem.svelte` to render a shift date/time chip with deterministic fallback behavior for: both fields present, only date present, only time present, neither present.
5. Add tests covering server payload + message content for each modified in-scope type and UI rendering behavior for notification chip states.

## In-Scope Notification Types

- `assignment_confirmed`
- `shift_reminder`
- `bid_won`
- `shift_auto_dropped`

## Out of Scope

- `bid_open`
- `emergency_route_available`
- Any non-shift notification type without assignment date/start-time context

## Verification

- For each in-scope type, verify persisted notification data includes `assignmentDate` and `routeStartTime` (or documented fallback path).
- For each modified sender, verify push/in-app title/body includes a readable shift date/time string.
- Verify `NotificationItem` chip renders correctly for all four metadata states (both/only-date/only-time/none).

## Acceptance Criteria Traceability

- AC: In-app notifications show shift date/time when present -> Steps 3-4 + server/message tests and UI chip-state tests.
- AC: Push payload title/body includes shift date/time -> Step 3 + per-type server tests for modified senders.
- AC: Tests cover at least one shift-related type producing correct inserted data -> Step 5 (expanded to all modified in-scope types, including inserted data assertions).

## Acceptance Criteria

- In-app notifications show shift date/time when present.
- Push payload title/body includes shift date/time.
- Tests cover at least one shift-related type producing the correct inserted data.
