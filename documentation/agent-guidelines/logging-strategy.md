# Logging & Observability (Pino + Axiom)

Drive uses structured logging via Pino. In production, logs ship to Axiom when `AXIOM_TOKEN` is set.

## 1) Where Logging Lives

- Logger implementation: `src/lib/server/logger.ts`
- Server request/error hooks: `src/hooks.server.ts`
- Dataset (prod): `AXIOM_DATASET` (defaults to `driver-ops`)
- Service field: `service: 'drive'`

Required env vars for Axiom shipping:

- `AXIOM_TOKEN` (required)
- `AXIOM_DATASET` (optional; defaults to `driver-ops`)

## 2) Logging Contract (Stable Schema)

All API request completion logs (`event = 'http.request.completed'`) should include:

- `requestId` (string)
- `method` (string)
- `route` (string route id or normalized path)
- `path` (string)
- `status` (number)
- `durationMs` (number)
- `userId` (string or `null`)

All unhandled server error logs (`event = 'http.server_error'`) should include:

- `requestId`
- `method`
- `route`
- `path`
- `status`
- `userId`
- `errorCode` (stable taxonomy)
- `errorType` (safe error class/name only)

## 3) Privacy Guardrails

Drive uses denylist-first redaction for sensitive fields, with an explicit allowlist for operational identifiers.

Operational IDs intentionally preserved for incident debugging:

- `requestId`
- `userId`, `driverId`, `managerId`
- `assignmentId`, `bidWindowId`, `routeId`, `warehouseId`, `winnerId`, `existingWindowId`

Sensitive fields always redacted before log shipping:

- `email`
- `token`, `fcmToken`
- `authorization`, `cookie`, `session`
- `ip`
- `password`, `secret`
- `apiKey` / `api_key`
- `privateKey` / `private_key`

Rules:

- Never log raw request bodies unless pre-redacted.
- Never log credentials, auth headers, or session artifacts.
- Avoid adding new identifier fields unless they are required for incident response.

## 4) Usage

### Basic

```ts
import logger from '$lib/server/logger';

logger.info({ op: 'seed', requestId }, 'Seed started');
logger.warn({ op: 'seed', errorCode: 'MISSING_DEPENDENCY', requestId }, 'Seed incomplete');
```

### Contextual Child Logger

```ts
import logger from '$lib/server/logger';

const log = logger.child({ event: 'user.profile.update', requestId, userId });
log.warn({ errorCode: 'USER_PROFILE_VALIDATION_FAILED' }, 'Profile update validation failed');
```

### Utility Redaction

```ts
import logger, { redactSensitive } from '$lib/server/logger';

logger.info(redactSensitive({ token: 'secret', authorization: 'Bearer ...' }), 'Incoming payload');
```

## 5) Startup Signals (Production)

The logger emits one cold-start signal in non-dev runtimes:

- `observability.transport.axiom.enabled` - Axiom transport initialized successfully.
- `observability.transport.stdout_fallback` - Axiom transport is not active and logs are flowing to stdout JSON fallback.

Fallback signal fields:

- `reason`: `missing_axiom_token` or `axiom_transport_init_failed`
- `errorType`: safe error type when transport init failed
- `axiomDataset`: dataset name used for transport configuration

## 6) Support Query Pack (Axiom)

Use these copy/paste queries in Axiom Query with dataset `driver-ops`.

### Single-user timeline

```apl
['driver-ops']
| where userId == "USER_ID"
| where _time > ago(7d)
| sort by _time desc
| project _time, level, event, route, path, status, durationMs, msg, requestId, errorCode, errorType
```

### Single-user errors only

```apl
['driver-ops']
| where userId == "USER_ID"
| where _time > ago(7d)
| where level == "error"
| sort by _time desc
| project _time, event, route, path, status, requestId, errorCode, errorType, msg
```

### Request deep-dive

```apl
['driver-ops']
| where requestId == "REQUEST_ID"
| sort by _time asc
| project _time, level, event, route, path, status, durationMs, userId, errorCode, errorType, msg
```

### Route error hotspots

```apl
['driver-ops']
| where _time > ago(24h)
| where level == "error"
| summarize errors = count() by route, path, errorCode
| order by errors desc
| limit 25
```

### API latency p95 by route

```apl
['driver-ops']
| where _time > ago(6h)
| where event == "http.request.completed"
| where isnotnull(durationMs)
| summarize p95_ms = percentile(durationMs, 95), requests = count() by route
| order by p95_ms desc
```

## 7) Incident Triage Checklist

When a user reports "the app crashed":

1. Get `userId` from DB/admin tools (avoid searching by email in logs).
2. Run **Single-user timeline** query for the reported time window.
3. Pivot to **Single-user errors only** and collect `requestId` from failing events.
4. Run **Request deep-dive** with that `requestId` to inspect the full request path.
5. Check **Route error hotspots** to determine if this is user-specific or system-wide.
6. If widespread, check monitor alerts and recent deploy window.

## 8) Monitors (Rollout: Observe -> Paging)

Configure monitors with email notifier (or on-call channel), then run in observe mode first.

Recommended baseline monitors:

1. **High error burst** (Threshold)
   - Every: 5m, Range: 5m, Trigger: `>= 5`
   - Query:

   ```apl
   ['driver-ops']
   | where _time > ago(5m)
   | where level == "error"
   | summarize error_count = count()
   ```

2. **No traffic / ingestion silent** (Threshold + no-data alert)
   - Every: 5m, Range: 5m, Trigger: `< 1`, Alert on no data: enabled
   - Query:

   ```apl
   ['driver-ops']
   | where _time > ago(5m)
   | summarize event_count = count()
   ```

3. **Auth abuse burst** (Threshold)
   - Every: 10m, Range: 10m, Trigger: `>= 10`
   - Query:

   ```apl
   ['driver-ops']
   | where _time > ago(10m)
   | where msg == "auth_rate_limit_exceeded"
   | summarize hit_count = count()
   ```

4. **Latency degradation (p95)** (Threshold)
   - Every: 15m, Range: 15m, Trigger: `>= 5000`
   - Query:
   ```apl
   ['driver-ops']
   | where _time > ago(15m)
   | where event == "http.request.completed"
   | summarize p95_ms = percentile(durationMs, 95)
   ```

Rollout guidance:

- Observe mode: 24-48h to tune thresholds and reduce noise.
- Paging mode: enable escalation only after false-positive rate is acceptable.

Free-tier note:

- If your Axiom plan is limited to 3 monitors, keep monitors 1-3 enabled.
- Defer monitor 4 (latency p95) until a slot is available.

## 9) Verification

1. **Transport**: deploy with `AXIOM_TOKEN`; confirm `observability.transport.axiom.enabled` appears once per cold start.
2. **Request correlation**: call an API route and verify response header `x-request-id` is present.
3. **Ingestion**: confirm request completion events arrive in `driver-ops` with `requestId`, `route`, `status`, `durationMs`.
4. **Support flow**: run single-user and request deep-dive queries against real events.
5. **Fallback path**: intentionally run without `AXIOM_TOKEN` and confirm `observability.transport.stdout_fallback` appears.
