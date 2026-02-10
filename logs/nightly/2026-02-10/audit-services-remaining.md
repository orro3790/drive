# DRV-9gz Nightly Audit - Remaining Services

Date: 2026-02-10
Scope:

- `src/lib/server/services/assignments.ts`
- `src/lib/server/services/assignmentLifecycle.ts`
- `src/lib/server/services/flagging.ts`
- `src/lib/server/services/metrics.ts`
- `src/lib/server/services/managers.ts`
- `src/lib/server/services/audit.ts`

## Executive Summary

- Reviewed lifecycle transitions, flagging policy math, metrics edge cases, manager scoping, audit logging, and query/performance risks.
- Confirmed several policy implementations are correct (attendance thresholds, grace-period timing, reward/base cap branching, and zero-shift metric guards).
- Found 2 critical and 4 high/medium issues that should be addressed before production hardening.

## Findings

### 1) CRITICAL - Confirmation window uses timezone conversion that can shift assignment day

- **Evidence:** `src/lib/server/services/assignmentLifecycle.ts:46`, `src/lib/server/services/assignmentLifecycle.ts:47`, `src/lib/server/services/assignmentLifecycle.ts:48`, `src/lib/server/services/assignmentLifecycle.ts:50`
- **What happens:** `assignmentDate` is parsed as a date, then converted with `toZonedTime`, then hour is set. In non-Toronto host timezones this can move the effective day backward/forward before applying shift hour.
- **Impact:** Confirmation open/deadline windows can be calculated for the wrong calendar day, impacting confirm/cancel behavior and downstream state gates.
- **Recommendation:** Build shift-start from calendar components in Toronto explicitly (or construct Toronto-local midnight first, then set hour) instead of converting an already-parsed date instant.

### 2) CRITICAL - Manual assignment race allows double assignment attempts

- **Evidence:** `src/lib/server/services/assignments.ts:41`, `src/lib/server/services/assignments.ts:67`, `src/lib/server/services/assignments.ts:111`, `src/lib/server/services/assignments.ts:121`
- **What happens:** Assignability (`status === 'unfilled'`) is checked before transaction, but update inside transaction does not guard on status.
- **Impact:** Concurrent managers can both pass pre-checks and race to update the same assignment; final writer wins, with inconsistent notifications/audit intent.
- **Recommendation:** Use an atomic update condition (`where id = ? and status = 'unfilled'`) and verify affected row count; abort if zero rows updated.

### 3) HIGH - Late-cancel boundary calculation is anchored to midnight, not shift start

- **Evidence:** `src/lib/server/services/assignmentLifecycle.ts:58`, `src/lib/server/services/assignmentLifecycle.ts:63`, `src/lib/server/services/assignmentLifecycle.ts:66`
- **What happens:** `calculateHoursUntilShift` subtracts current minutes from day-diff to midnight, not from actual shift start hour.
- **Impact:** Late-cancel classification can trigger several hours early/late (up to shift start offset), affecting penalties and user-facing policy enforcement.
- **Recommendation:** Compute duration to actual shift start timestamp (same source used by confirmation window) and derive late-cancel from that exact diff.

### 4) HIGH - Bid window selection is ambiguous when multiple windows exist

- **Evidence:** `src/lib/server/services/assignments.ts:99`, `src/lib/server/services/assignments.ts:102`
- **What happens:** Manual assignment reads `bid_windows` by `assignmentId` only, without status filter or deterministic ordering.
- **Impact:** If historical/resolved windows coexist with an open one, the wrong row can be chosen, leaving active windows unresolved.
- **Recommendation:** Select only the currently open window (`status = 'open'`) and enforce deterministic behavior (or add a uniqueness/business rule for active windows).

### 5) HIGH - Audit entity ID type coupling can break user-entity logging

- **Evidence:** `src/lib/server/db/schema.ts:309`, `src/lib/server/services/flagging.ts:141`, `src/lib/server/services/flagging.ts:143`
- **What happens:** `audit_logs.entity_id` is UUID, while flagging logs `entityType: 'user'` with `entityId = userId` where auth user IDs are text (`src/lib/server/db/auth-schema.ts:17`).
- **Impact:** Non-UUID user IDs can cause runtime insert failures, potentially breaking flagging flows when audit insert is attempted.
- **Recommendation:** Either make `audit_logs.entity_id` text (or polymorphic), or enforce UUID user IDs at auth layer and validate before insert.

### 6) MEDIUM - Manager warehouse lookup is missing a user_id-leading index

- **Evidence:** `src/lib/server/services/managers.ts:20`, `src/lib/server/db/schema.ts:125`, `src/lib/server/db/schema.ts:126`
- **What happens:** `getManagerWarehouseIds` filters by `warehouse_managers.user_id`, but schema defines index on `warehouse_id` and unique pair `(warehouse_id, user_id)` only.
- **Impact:** Manager-scoped endpoints can degrade with table growth due to weaker index selectivity for user-based scans.
- **Recommendation:** Add `index('idx_warehouse_managers_user').on(table.userId)`.

### 7) MEDIUM - Post-commit notification failures can surface false-negative API responses

- **Evidence:** `src/lib/server/services/assignments.ts:166`, `src/lib/server/services/assignments.ts:177`, `src/lib/server/services/assignments.ts:184`
- **What happens:** DB transaction commits assignment changes first; notification sends happen after commit and are not isolated.
- **Impact:** If notification path throws, callers can receive an error even though assignment state already changed, causing retry confusion.
- **Recommendation:** Make notification stage best-effort with error capture/telemetry, or return success with partial-notification metadata.

## Checks Completed (No Immediate Defect Found)

- **Flagging thresholds:** `<10 => 0.8`, `>=10 => 0.7` correctly sourced through `getAttendanceThreshold` (`src/lib/config/dispatchPolicy.ts:93`).
- **Grace period behavior:** one-week grace and cap floor logic are implemented (`src/lib/server/services/flagging.ts:103`, `src/lib/server/services/flagging.ts:105`).
- **Metrics edge cases:** zero-shift fallback avoids divide-by-zero (`src/lib/server/services/metrics.ts:58`).
- **Entity audit query path:** indexed retrieval by `(entityType, entityId, createdAt desc)` exists (`src/lib/server/db/schema.ts:317`).

## Priority Fix Order

1. Fix lifecycle timezone/day construction and late-cancel duration math.
2. Make manual assignment atomic to prevent race-condition reassignment.
3. Resolve audit entity ID type mismatch for user-entity logs.
4. Tighten bid-window selection semantics and add user_id warehouse-manager index.
