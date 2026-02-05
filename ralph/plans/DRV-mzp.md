# In-app notification inbox

Task: DRV-mzp

## Steps

1. Review specs and data model for notifications to confirm fields, routes, and role access.
2. Implement notifications queries with userId scoping, ORDER BY createdAt DESC, pagination, and unread count using the indexed userId/read filters.
3. Define request/response schemas and add API endpoints with auth/ownership checks for list, mark read, and mark all read.
4. Build driver and manager notification pages with optimistic read/mark-all updates, distinct unread styling, and empty/error states.
5. Add sidebar unread count badge and wire UI interactions to mark notifications read.

## Acceptance Criteria

- User sees list of their notifications, newest first
- Unread notifications visually distinct
- Clicking notification marks it as read
- "Mark all as read" button clears all unread
- Sidebar shows unread count badge
- Pagination for users with many notifications
- Both drivers and managers have notification inbox
