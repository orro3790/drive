# Seed Data Script

Task: Create realistic test data for ~100 drivers

## Overview

Create `scripts/seed.ts` that generates realistic test data for the Drive app with configurable scale (dev: 10 drivers, staging: 100 drivers).

## Scale Configurations

| Mode    | Drivers | Managers | Warehouses | Routes | Past Weeks | Future Weeks |
| ------- | ------- | -------- | ---------- | ------ | ---------- | ------------ |
| dev     | 10      | 2        | 2          | 10     | 2          | 2            |
| staging | 100     | 5        | 4          | 40     | 3          | 2            |

## Files to Create

```
scripts/
  seed.ts                    # Main entry point
  seed/
    config.ts                # Scale configurations
    generators/
      users.ts               # Driver + account table seeding
      warehouses.ts          # Warehouse generation
      routes.ts              # Route generation
      preferences.ts         # Driver preferences
      metrics.ts             # Driver metrics
      assignments.ts         # Assignments + shifts
      route-completions.ts   # Route familiarity data
      bidding.ts             # Bid windows and bids
    utils/
      password.ts            # Scrypt hashing
      dates.ts               # Toronto timezone helpers
```

## Implementation Steps

### 1. Add faker.js dependency

```bash
pnpm add -D @faker-js/faker
```

### 2. Create utility modules

**`scripts/seed/utils/password.ts`**

```typescript
import { scryptAsync } from '@noble/hashes/scrypt';
import { bytesToHex, randomBytes } from '@noble/hashes/utils';

export async function hashPassword(password: string): Promise<string> {
	const salt = bytesToHex(randomBytes(16));
	const key = await scryptAsync(
		password.normalize('NFKC'), // Critical: NFKC normalization
		salt,
		{ N: 16384, r: 16, p: 1, dkLen: 64, maxmem: 128 * 16384 * 16 * 2 }
	);
	return `${salt}:${bytesToHex(key)}`; // Template literal format
}
```

**`scripts/seed/utils/dates.ts`**

- Toronto timezone helpers using `date-fns-tz`
- Week start calculation (Monday-based)

### 3. Create generators (dependency order)

**1. users.ts** - Generate drivers with BOTH tables:

```typescript
// Insert into user table
await db.insert(user).values({
	id: nanoid(21), // Match Better Auth ID format
	name,
	email,
	phone,
	role: 'driver',
	weeklyCap,
	isFlagged,
	flagWarningDate,
	createdAt
});

// Insert into account table (CRITICAL for login)
await db.insert(account).values({
	id: nanoid(21),
	userId: driver.id,
	accountId: driver.email, // Better Auth uses email as accountId
	providerId: 'credential',
	password: hashedPassword,
	createdAt: new Date()
});
```

**2. warehouses.ts** - Toronto-area warehouse names

**3. routes.ts** - Routes with prefix codes (TC-001, MW-002, etc.)

**4. preferences.ts** - Each driver gets:

- 3-6 preferred days (as integers 0-6)
- 1-3 preferred routes (UUID array)

**5. metrics.ts** - Realistic distribution:

- 70% high performers (85-100% rates)
- 20% medium (70-85%)
- 10% low (<70%)

**6. assignments.ts** - Timeline:

- Past 2-3 weeks: 85% completed, 10% cancelled, 5% unfilled
- Current week: mix based on day (past=completed, future=scheduled)
- Next 2 weeks: scheduled or unfilled
- Parcel counts: start=100-200, delivered=90-100% of start

**7. route-completions.ts** - Based on completed assignments:

- For each completed shift, increment route completion count
- Builds route familiarity for realistic bid scoring

**8. bidding.ts** - For cancelled/unfilled assignments:

- Create bid windows with status based on timing:
  - Past closesAt → status='resolved', winnerId set
  - Future closesAt → status='open'
- Generate 3-8 bids per window
- Past bids: status='won' or 'lost' based on score
- Future bids: status='pending'

### 4. Main seed script

**`scripts/seed.ts`**

```typescript
#!/usr/bin/env tsx
async function main() {
	// 1. Parse args (--staging, --dry-run)
	// 2. Connect to DB via Neon
	// 3. Clear existing data (keep managers via WHERE role='manager')
	// 4. Seed in order:
	//    warehouses → routes → drivers+accounts → preferences
	//    → metrics → assignments+shifts → routeCompletions → bidding
	// 5. Log progress and summary
}
```

### 5. Idempotent cleanup logic

```typescript
async function clearData() {
	// Delete in reverse dependency order
	await db.delete(auditLogs);
	await db.delete(notifications);
	await db.delete(bids);
	await db.delete(bidWindows);
	await db.delete(routeCompletions);
	await db.delete(shifts);
	await db.delete(assignments);
	await db.delete(driverMetrics);
	await db.delete(driverPreferences);
	await db.delete(routes);
	await db.delete(warehouses);

	// Delete driver accounts (keep managers)
	const driverIds = db.select({ id: user.id }).from(user).where(eq(user.role, 'driver'));
	await db.delete(account).where(inArray(account.userId, driverIds));
	await db.delete(user).where(eq(user.role, 'driver'));
}
```

### 6. Add package.json scripts

```json
{
	"seed": "tsx scripts/seed.ts",
	"seed:staging": "tsx scripts/seed.ts --staging"
}
```

## Critical Files (Reference)

- `src/lib/server/db/schema.ts` - Domain tables (assignments, routes, etc.)
- `src/lib/server/db/auth-schema.ts` - Better Auth tables (user, account, session)
- `scripts/reset-manager-v2.ts` - Working password hash example
- `src/lib/server/services/scheduling.ts` - Timezone utilities

## Verification

1. Run seed: `pnpm seed`
2. Check database via Drizzle Studio: `pnpm drizzle-kit studio`
3. Verify tables populated: user, account, warehouses, routes, assignments, etc.
4. Login as seeded driver (e.g., first faker email / `test1234`)
5. Navigate to /schedule - should see assignments for current/next week
6. Test cancellation flow - bid window should be created

## Acceptance Criteria

- [ ] `pnpm seed` creates 10 drivers with full data graph
- [ ] `pnpm seed:staging` creates 100 drivers
- [ ] Script is idempotent (re-run clears and recreates)
- [ ] Seeded drivers can log in (account table populated)
- [ ] Foreign key relationships all valid
- [ ] Driver metrics reflect realistic distributions
- [ ] Past assignments have completed shifts with parcel data
- [ ] routeCompletions populated based on completed shifts
- [ ] Cancelled assignments have resolved bid windows
- [ ] Schedule page shows seeded assignments
