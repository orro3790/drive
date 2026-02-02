# Domain Context

Driver Operations Platform-specific context for interviews.

## Tech Stack

- **Framework**: SvelteKit + Svelte 5 (Runes), TypeScript
- **Mobile**: Capacitor wrapper for native push notifications
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Auth**: Better Auth (session-based)
- **Hosting**: Vercel (with Cron for scheduled jobs)
- **Real-time**: Server-Sent Events (SSE)

## Domain Model

- **Users**: Drivers and Managers
- **Routes**: Named delivery regions (e.g., "Guelph1", "Hamilton B")
- **Warehouses**: Pickup locations with addresses
- **Assignments**: Driver-to-route mappings for specific dates
- **Bids**: Driver interest in open shifts (bidding window + algorithm selection)
- **Shifts**: Active work sessions with parcel tracking

## Common Patterns

- **Scheduling**: 2-week lookahead, Sunday lock, sticky routes
- **Replacement**: Bidding window (30 min default), algorithm-based selection
- **Performance**: Completion rate, attendance rate, route familiarity
- **Flagging**: Below threshold → warning → grace period → cap reduction

## Anti-Patterns to Avoid

1. **Accepting vague specs**: "Make it user-friendly" is not a spec
2. **Skipping security review**: Every feature has security implications
3. **Assuming implementation**: Gather requirements, don't prescribe solutions
4. **Over-interviewing**: Know when you have enough; don't bikeshed
5. **Ignoring constraints**: Tech stack and resources matter
6. **Forgetting observability**: If we can't debug it, we can't maintain it
