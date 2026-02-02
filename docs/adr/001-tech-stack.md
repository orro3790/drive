# ADR 001: Tech Stack Selection

## Status
Accepted

## Date
2026-02-02

## Context

We need to build an operations automation platform for delivery logistics with:
- Mobile-first driver interface
- Manager web dashboard
- Real-time replacement notifications
- Offline read capability
- Push notifications (critical for time-sensitive shift openings)

Constraints:
- Solo developer with full-stack experience
- Strong expertise in Svelte/TypeScript
- No native mobile development experience
- Existing component library to reuse
- Internal tool only (no app store verification needed)

## Decision

### Frontend: SvelteKit + TypeScript
**Rationale**: Developer expertise, agent-friendly typed code, mature framework capable of handling full backend requirements.

### Mobile: Capacitor wrapper
**Rationale**: Native push notifications required for iOS reliability. Capacitor wraps web code with minimal overhead. Developer doesn't need to learn React Native or Flutter.

**Rejected alternatives**:
- Pure PWA: iOS push notification support is unreliable when app is closed
- React Native/Flutter: Learning curve too steep for timeline

### Database: PostgreSQL on Neon
**Rationale**: Relational model fits the domain well (users, routes, assignments, bids). Neon provides serverless scaling, branching for dev, and Vercel integration. No vendor lock-in compared to Firebase.

### ORM: Drizzle
**Rationale**: Type-safe, excellent DX with TypeScript, generates migrations. Developer familiar with the tool.

### Auth: Better Auth
**Rationale**: Session-based auth that works well with SvelteKit. Developer familiar with the library.

### Hosting: Vercel
**Rationale**: First-class SvelteKit adapter, free cron jobs sufficient for scale, good DX. Developer familiar with platform.

**Rejected alternatives**:
- AWS: Developer found it bloated and complicated
- Cloudflare: Would work but no prior experience

### Push Notifications: Firebase Cloud Messaging via Capacitor
**Rationale**: Industry standard, free unlimited usage, works on both iOS and Android, well-documented Capacitor plugin.

### Scheduled Jobs: Vercel Cron
**Rationale**: Free tier, 60-second execution limit is plenty for 80-100 driver scale. Simple to set up.

**Rejected alternatives**:
- Upstash QStash: More sophisticated but unnecessary for this scale
- Trigger.dev: Overkill for simple scheduled tasks

### Real-time Dashboard: Server-Sent Events (SSE)
**Rationale**: Simple, one-way updates are sufficient for manager dashboard. No need for full WebSocket complexity.

## Consequences

### Positive
- Leverages existing developer expertise
- Reuses existing component library
- Simple deployment story (single Vercel project)
- Type safety throughout the stack
- No vendor lock-in on database

### Negative
- Capacitor adds build complexity (iOS requires Mac, Xcode)
- Need to maintain iOS and Android native projects (minimal)
- SSE may need upgrade to WebSockets if two-way communication needed later

### Risks
- Vercel Cron 60s limit could become constraint at larger scale (mitigate: can switch to external job runner)
- Capacitor push notifications require Firebase project setup
