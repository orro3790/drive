# DRV-c0m Nightly Audit - Bidding API Endpoints

Date: 2026-02-10
Task: DRV-c0m

## Scope

- `src/routes/api/bids/+server.ts` (submit)
- `src/routes/api/bids/available/+server.ts`
- `src/routes/api/bids/mine/+server.ts`
- `src/routes/api/bid-windows/+server.ts` (list)
- `src/routes/api/bid-windows/[id]/close/+server.ts`
- `src/routes/api/bid-windows/[id]/assign/+server.ts`
- Supporting contracts: `src/lib/schemas/api/bidding.ts`, `src/lib/server/services/bidding.ts`, `src/lib/server/db/schema.ts`, `documentation/adr/002-replacement-bidding-system.md`

## Findings Summary

- Critical: 2
- High: 2
- Medium: 3
- Low: 1

## Findings

### CRITICAL - Reopened assignments can be permanently hidden/blocked for drivers who previously bid

- Evidence:
  - `src/routes/api/bids/+server.ts:92` checks prior bids by `(assignmentId, userId)` with no status/window scoping, then blocks (`src/routes/api/bids/+server.ts:99`).
  - `src/routes/api/bids/available/+server.ts:82` pulls all prior bids for the driver and excludes any matching assignment (`src/routes/api/bids/available/+server.ts:93`).
  - The architecture explicitly allows multiple bid windows per assignment (`documentation/adr/002-replacement-bidding-system.md:115`).
- Impact: If an assignment is reopened (for cancellation/no-show/emergency), drivers who bid in a prior window can be prevented from seeing or bidding again, shrinking the candidate pool on time-critical fills.
- Recommendation: Scope duplicate checks to the active/open window (or at minimum `pending` for the active lifecycle), and persist explicit window linkage on bids so reopen cycles are safe.

### CRITICAL - Manager close/assign paths are not lock-safe against concurrent instant acceptance

- Evidence:
  - `instantAssign` serializes with `SELECT ... FOR UPDATE` (`src/lib/server/services/bidding.ts:759`).
  - Manager manual assign reads window state without row lock (`src/routes/api/bid-windows/[id]/assign/+server.ts:65`) and later writes assignment/window state in a transaction (`src/routes/api/bid-windows/[id]/assign/+server.ts:116`).
  - Manager close follows the same read-then-write pattern (`src/routes/api/bid-windows/[id]/close/+server.ts:39`, `src/routes/api/bid-windows/[id]/close/+server.ts:78`).
- Impact: Concurrent manager action and driver instant accept can produce stale-write races (winner overwrite, inconsistent notifications, divergent audit trail).
- Recommendation: Lock bid-window rows in manager mutation endpoints, use status-conditional updates (`... where id = ? and status = 'open'`), and fail fast with `409` on stale state.

### HIGH - Competitive submit path has check-then-insert race risk for duplicate pending bids

- Evidence:
  - Duplicate check and insert are separate operations (`src/routes/api/bids/+server.ts:92`, `src/routes/api/bids/+server.ts:190`).
  - No unique constraint protects `(assignment_id, user_id, pending)` in schema (`src/lib/server/db/schema.ts:192`).
- Impact: Near-simultaneous submissions can create duplicate pending bids, distorting scoring/resolution and fairness.
- Recommendation: Add a database uniqueness guard (preferably window-scoped) and handle conflict deterministically in the API path.

### HIGH - Bids are not linked to bid-window IDs, weakening multi-window correctness

- Evidence:
  - `bids` table has no `bidWindowId` foreign key (`src/lib/server/db/schema.ts:195`).
  - Resolution pulls pending bids by assignment only (`src/lib/server/services/bidding.ts:447`).
- Impact: Window-specific guarantees are weaker than required for repeated/reopened windows and race recovery; bid lineage/audit is harder to trust under edge conditions.
- Recommendation: Add `bidWindowId` on bids, backfill/migrate, and scope duplicate checks + resolution queries by window ID.

### MEDIUM - Pagination is missing on list/read endpoints

- Evidence:
  - List schema only supports `status`, `since`, `warehouseId` (`src/lib/schemas/api/bidding.ts:27`).
  - `/api/bids/mine`, `/api/bids/available`, and `/api/bid-windows` return full arrays with no cursor/limit controls (`src/routes/api/bids/mine/+server.ts:23`, `src/routes/api/bids/available/+server.ts:57`, `src/routes/api/bid-windows/+server.ts:105`).
- Impact: Payload and query cost scale linearly with history/warehouse growth, increasing latency and mobile data usage.
- Recommendation: Add cursor-based pagination with bounded default page size and stable ordering contracts.

### MEDIUM - Post-commit side effects can fail the request after state has already mutated

- Evidence:
  - Manual assign sends notifications and broadcasts without local error isolation (`src/routes/api/bid-windows/[id]/assign/+server.ts:177`, `src/routes/api/bid-windows/[id]/assign/+server.ts:191`).
  - Close endpoint broadcasts without local error isolation (`src/routes/api/bid-windows/[id]/close/+server.ts:106`).
- Impact: Client can receive `500` even though DB mutation succeeded, encouraging retries and causing duplicate side effects.
- Recommendation: Treat notifications/SSE as best-effort or outbox-driven; always return mutation result once durable writes commit.

### MEDIUM - API surface drift: no dedicated `POST /api/bid-windows` create endpoint

- Evidence:
  - `src/routes/api/bid-windows/+server.ts` exposes `GET` only (`src/routes/api/bid-windows/+server.ts:25`).
  - Creation exists through service-driven or alternate routes (for example manager emergency reopen: `src/routes/api/assignments/[id]/emergency-reopen/+server.ts:76`).
- Impact: Operator expectations and route discoverability are inconsistent with a conventional CRUD surface, and can confuse client/API consumers.
- Recommendation: Either formalize/document the non-CRUD creation model or add an explicit manager-scoped create endpoint with strict policy checks.

### LOW - Success/error response envelope is inconsistent across bidding endpoints

- Evidence:
  - Submit returns `{ success, status, ... }` (`src/routes/api/bids/+server.ts:81`).
  - Read/list endpoints return resource arrays without success envelope (`src/routes/api/bids/mine/+server.ts:56`, `src/routes/api/bids/available/+server.ts:118`, `src/routes/api/bid-windows/+server.ts:144`).
  - Close/assign return `{ bidWindow }` (`src/routes/api/bid-windows/[id]/close/+server.ts:144`, `src/routes/api/bid-windows/[id]/assign/+server.ts:208`).
- Impact: Client-side error/success handling requires endpoint-specific branching.
- Recommendation: Standardize response envelopes (or codify endpoint-specific contracts in generated client types/docs).

## Traceability Matrix

Legend: PASS = acceptable in current code, RISK = issue found, GAP = missing route/contract mismatch, N/A = not applicable.

| Criterion                               | submit | available | mine | list | create | close | assign |
| --------------------------------------- | ------ | --------- | ---- | ---- | ------ | ----- | ------ |
| Auth + role boundaries                  | PASS   | PASS      | PASS | PASS | GAP    | PASS  | PASS   |
| Manager warehouse scoping               | N/A    | N/A       | N/A  | PASS | GAP    | PASS  | PASS   |
| Input validation                        | PASS   | PASS      | PASS | PASS | GAP    | PASS  | PASS   |
| Duplicate bid prevention correctness    | RISK   | RISK      | N/A  | N/A  | GAP    | N/A   | N/A    |
| Closed/assigned submission guardrails   | PASS   | PASS      | N/A  | N/A  | GAP    | PASS  | PASS   |
| Race-condition safety                   | RISK   | RISK      | N/A  | RISK | GAP    | RISK  | RISK   |
| Manager bypass policy vs emergency mode | N/A    | N/A       | N/A  | N/A  | GAP    | PASS  | PASS   |
| Available filtering + eligibility       | N/A    | RISK      | N/A  | N/A  | GAP    | N/A   | N/A    |
| Response pagination                     | RISK   | RISK      | RISK | RISK | GAP    | PASS  | PASS   |
| Error-handling consistency              | PASS   | PASS      | PASS | PASS | GAP    | RISK  | RISK   |

## Checks Completed (No Immediate Defect Found)

- Existing endpoints enforce authentication and role checks (`driver` only for bids; `manager` only for bid-window operations).
- Warehouse access controls are applied on manager mutating endpoints and list filtering (`canManagerAccessWarehouse` / `getManagerWarehouseIds`).
- Zod validation is present for request params/bodies/query parameters in audited routes.
- Available-bids endpoint excludes non-open/non-active windows and enforces weekly-cap eligibility before exposing bids.
- Manager override behavior is intentionally broad by policy (`documentation/adr/002-replacement-bidding-system.md:70`), not limited to emergency mode.

## Priority Fix Order

1. Fix reopen-cycle correctness: window-scope duplicate logic and add explicit bid-to-window linkage.
2. Add lock-safe stale-write protection on manager close/assign to eliminate winner overwrite races.
3. Add DB-level uniqueness protections for pending bids and conflict-aware API handling.
4. Stabilize post-commit side effects (best-effort/outbox), then add pagination to read/list endpoints.
