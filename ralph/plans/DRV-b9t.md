# Route CRUD (Manager)

Task: DRV-b9t

## Steps

1. Review existing route/warehouse models, assignments, audit logging, and manager auth; add route list data access with warehouse join, status computation, and filters (warehouse, status, date).
2. Implement GET /api/routes with manager-only auth to return route name, warehouse, and current-day status with filter support.
3. Implement POST/PATCH/DELETE routes endpoints with manager-only auth, validation, unique-name-per-warehouse enforcement, delete guard for future assignments, and audit logging.
4. Build the manager routes UI at src/routes/(manager)/routes/+page.svelte with filters and a DataTable showing route, warehouse, and status.
5. Wire create/edit/delete flows to the API and refresh the table after mutations.

## Acceptance Criteria

- Manager can view all routes with warehouse association
- Manager can filter routes by warehouse, status, and date
- Manager can create route (name required, warehouse required)
- Manager can edit route name or reassign to different warehouse
- Manager can delete route only if no future assignments exist
- Routes display current day's assignment status (assigned/unfilled/bidding)
- All changes logged to auditLogs
