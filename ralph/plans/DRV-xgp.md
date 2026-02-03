# Driver schedule view

Task: DRV-xgp

## Steps

1. Confirm week start/end boundaries and late-cancel timestamp basis from specs (Toronto timezone, inclusive/exclusive rules).
2. Implement GET /api/assignments/mine scoped to the current driver for a two-week window (current week + next week) with Toronto timezone boundaries and joins to routes/warehouses.
3. Implement POST /api/assignments/:id/cancel scoped to the current driver with future-only enforcement, explicit 404/403 handling for non-owned IDs, reason enum validation, status update, audit log, late-cancel flag calculation, and bid window trigger.
4. Build schedule page at src/routes/(app)/schedule/+page.svelte with weekly sections and cancel flow (reason selection, late warning), wired to APIs.

## Acceptance Criteria

- Driver sees all their assignments for current and next week
- Assignments show date, route, warehouse name, status
- Driver can cancel any future assignment
- Cancellation requires selecting a reason from enum
- Late cancellation (< 48h) shows warning that it affects metrics
- Cancelled assignment triggers bid window for replacement
- Assignment status updates to 'cancelled' immediately
