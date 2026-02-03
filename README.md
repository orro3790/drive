# Drive

Driver Operations Platform for delivery logistics.

**Repository**: `orro3790/drive`

## Overview

Drive is an event-driven operations automation platform that manages driver scheduling, route assignments, and performance tracking for delivery operations. It automates driver-to-route scheduling with a 2-week lookahead model and handles gaps through an algorithm-based bidding system.

## Tech Stack

- **Frontend**: SvelteKit + TypeScript
- **Database**: PostgreSQL (Neon) + Drizzle ORM
- **Auth**: Better Auth (session-based)
- **Hosting**: Vercel
- **Push**: Firebase Cloud Messaging
- **Observability**: Pino + Axiom
- **i18n**: Paraglide (en, zh)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database (Neon account recommended)
- Firebase project with FCM enabled

### Setup

1. Clone the repository:

```bash
git clone https://github.com/orro3790/drive.git
cd drive
```

2. Install dependencies:

```bash
pnpm install
```

3. Configure environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

- `DATABASE_URL` - Neon PostgreSQL connection string (pooled)
- `BETTER_AUTH_SECRET` - Random secret for session signing (generate with `openssl rand -base64 32`)
- `BETTER_AUTH_URL` - `http://localhost:5173` for local dev
- Firebase Admin SDK credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)

See `.env.example` for full documentation.

4. Set up the database:

```bash
# Push schema to database
pnpm drizzle-kit push

# Or generate and run migrations
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

5. Start development server:

```bash
pnpm dev
```

Visit `http://localhost:5173`

## Project Structure

```
src/
├── routes/
│   ├── (auth)/              # Authentication pages
│   ├── (manager)/           # Manager-only dashboard
│   │   ├── warehouses/      # Warehouse CRUD
│   │   ├── drivers/         # Driver management (planned)
│   │   └── routes/          # Route management (planned)
│   └── api/                 # API endpoints
│       └── users/
│           └── fcm-token/   # FCM token registration
├── lib/
│   ├── components/          # UI components
│   │   ├── primitives/      # Design system components
│   │   └── data-table/      # TanStack table wrapper
│   ├── schemas/             # Zod schemas (source of truth for types)
│   ├── stores/              # Svelte 5 state stores
│   └── server/              # Server-side code
│       ├── db/              # Drizzle schema & client
│       ├── services/        # Business logic (scheduling, notifications)
│       ├── emails/          # Email templates (Resend)
│       └── auth.ts          # Better Auth config
└── app.css                  # Design tokens
```

## Documentation

| Document               | Location                   |
| ---------------------- | -------------------------- |
| Technical Spec         | `docs/specs/SPEC.md`       |
| Data Model             | `docs/specs/data-model.md` |
| Agent Guidelines       | `docs/agent-guidelines.md` |
| Project Instructions   | `CLAUDE.md`                |
| Architecture Decisions | `docs/adr/`                |

## Key Concepts

### Scheduling

- **2-week lookahead**: Drivers set preferences for Week N+2 while Week N+1 is locked
- **Sunday lock**: Preferences lock at 23:59 Toronto time every Sunday
- **Auto-assignment**: Algorithm assigns routes based on preferences + performance

### Bidding System

- **Not FCFS**: Algorithm-based scoring when assignments become unfilled
- **Scoring factors**: Completion rate (40%), route familiarity (30%), attendance (20%), preferences (10%)
- **Notifications**: Push alerts sent to all eligible drivers when bid windows open

### Performance Tracking

- **Weekly caps**: Default 4 days/week, increases to 6 after 20 shifts with 95%+ attendance
- **Flagging**: Drivers below attendance thresholds get 1 week grace period, then lose 1 day from cap
- **Metrics**: Attendance rate, completion rate, route familiarity

## Development

### Available Scripts

```bash
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm preview      # Preview production build
pnpm check        # Run type checking
pnpm lint         # Run ESLint
pnpm format       # Format with Prettier
```

### Database Commands

```bash
pnpm drizzle-kit generate    # Generate migration from schema changes
pnpm drizzle-kit migrate     # Apply pending migrations
pnpm drizzle-kit push        # Push schema directly (dev only)
pnpm drizzle-kit studio      # Open Drizzle Studio UI
```

## Deployment

Deploy to Vercel:

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel Dashboard:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - Firebase credentials
   - `AXIOM_TOKEN` (for production logging)
3. Deploy

Note: `BETTER_AUTH_URL` is auto-detected from `VERCEL_URL` in production.

## License

Proprietary - All rights reserved
