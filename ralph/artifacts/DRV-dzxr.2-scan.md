# DRV-dzxr.2 manager i18n scan

Command:

`grep pattern: Reset Another User|Today|day[s]?|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Email is required|Password must be at least|Passwords do not match|No user found|Access denied|Failed to reset password|User does not have`

Scope:

- `src/routes/(manager)/**/*.{svelte,ts}`

## Included findings (fixed)

- `src/routes/(manager)/admin/reset-password/+page.svelte`: `Reset Another User`
- `src/routes/(manager)/admin/reset-password/+page.server.ts`: hardcoded user-facing error strings
- `src/routes/(manager)/drivers/+page.svelte`: weekly cap labels (`1 day` ... `6 days`) and detail suffix `days`
- `src/routes/(manager)/routes/+page.svelte`: `Today` chip label and forced `en-US` date rendering
- `src/routes/(manager)/weekly-reports/+page.svelte`: hardcoded month abbreviations (`Jan` ... `Dec`)

## Exclusions

- `day` identifier occurrences used in date math and ISO formatting (for example `const day = ...`, `day: 'numeric'`) are implementation details, not user-visible copy.
- `m.notifications_group_today()` and `m.drivers_weekly_cap_option_*()` are localized message references, not hardcoded literals.
