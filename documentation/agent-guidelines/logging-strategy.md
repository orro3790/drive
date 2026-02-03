# Logging & Observability (Pino + Axiom)

Drive uses structured logging via Pino. In production, logs ship to Axiom when `AXIOM_TOKEN` is set.

## 1) Where Logging Lives

- Logger: `src/lib/server/logger.ts`
- Dataset (prod): `driver-ops`
- Service field: `service: 'drive'`

## 2) Principles

- Log events (outcomes and key identifiers), not step-by-step progress spam.
- Use structured fields so Axiom queries are easy.
- Never log secrets or sensitive user data.

## 3) Usage

### Basic

```ts
import logger from '$lib/server/logger';

logger.info({ operation: 'seed' }, 'Seed started');
logger.warn({ operation: 'seed', missing: 'AXIOM_TOKEN' }, 'Running without Axiom');
```

### Contextual Child Logger

```ts
import { createContextLogger } from '$lib/server/logger';

export async function createWarehouse(userId: string) {
	const log = createContextLogger({ op: 'createWarehouse', userId });
	log.info('Create warehouse');
}
```

### Redaction

```ts
import logger, { redactSensitive } from '$lib/server/logger';

logger.info(redactSensitive({ token: 'secret', authorization: 'Bearer ...' }), 'Incoming payload');
```

## 4) What to Include

Prefer stable identifiers and coarse metadata:

- `op`: operation name (e.g., `createBid`, `generateWeekSchedule`)
- `userId`: authenticated user id (not email/phone)
- Domain ids: `warehouseId`, `routeId`, `assignmentId`, `bidId`
- `durationMs`: elapsed duration for slow operations

## 5) What NOT to Log

- Passwords, session cookies, auth headers
- Raw request bodies unless redacted
- Emails/phones unless absolutely necessary (and then consider hashing)
