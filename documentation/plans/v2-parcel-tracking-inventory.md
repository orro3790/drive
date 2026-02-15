# V2: Parcel Tracking & Inventory System

**Status:** Future Feature (Post-MVP)
**Scope:** Full parcel lifecycle — intake, labels, scanning, route optimization

---

## Key Decisions

| Decision      | Choice             | Implication                                                                              |
| ------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| Shift counts  | **Replace**        | Parcel events become source of truth; deprecate `shifts.parcelsStart/Delivered/Returned` |
| V2 scope      | **Full lifecycle** | Manifests, PDF labels, scanning, route optimization                                      |
| Discrepancies | **Manual review**  | Flag mismatches for manager resolution                                                   |
| Photos/ZPL    | **Deferred to V3** | PDF-only labels, no photo storage                                                        |

---

## Overview

Extend Drive from a driver scheduling platform to a full delivery operations platform with parcel-level tracking, label generation, and route optimization.

**Breaking change:** Shift-level parcel counts (`parcelsStart`, `parcelsDelivered`, `parcelsReturned`) will be deprecated. Parcel events become the authoritative source for delivery metrics.

---

## Feature Components

### 1. Parcel Scanning (Driver App)

**Capability:** Drivers scan QR/barcode on parcels via smartphone camera to record delivery events.

**Implementation:**

- Capacitor plugin: `@nicholasbraun/barcode-scanner` or `capacitor-barcode-scanner`
- Fallback: Web-based scanning via `html5-qrcode` for PWA mode
- Scan triggers modal: Mark delivered / Failed attempt / Return to sender

**Data captured per scan:**

- `parcelId` (from barcode)
- `driverId`, `assignmentId` (from session)
- `timestamp` (automatic)
- `geolocation` (automatic)
- `eventType`: `scanned_out` | `delivered` | `attempted` | `returned`
- `notes` (optional, driver comments)

**Offline behavior (IndexedDB queue):**

```typescript
// src/lib/stores/parcelSyncQueue.svelte.ts
interface QueuedScan {
	id: string; // client-generated UUID
	parcelId: string;
	eventType: string;
	clientTimestamp: Date;
	latitude?: number;
	longitude?: number;
	notes?: string;
	synced: boolean;
}
```

- Scans stored in IndexedDB immediately
- Background sync when online (navigator.onLine + fetch)
- Conflict resolution: server timestamp wins, client timestamp preserved for audit
- UI shows pending sync count badge

---

### 2. Label Generation (PDF Only)

**Capability:** Generate printable shipping labels with tracking barcodes.

**Implementation:**

- Generate labels as PDF only (ZPL deferred to V3)
- Libraries: `pdfkit` or `@react-pdf/renderer` (server-side)
- Label contains: QR code, tracking number, recipient address, routing code

**Endpoints:**

- `GET /api/parcels/:id/label` — Single label PDF
- `POST /api/parcels/labels` — Bulk labels (array of parcel IDs → multi-page PDF)

---

### 3. Inventory Onboarding

**Capability:** Efficiently ingest parcels into the system with full audit trail.

**Methods:**

**A. Manifest Upload (Primary)**

- CSV upload with columns: tracking#, recipient, address, weight, etc.
- Validation + preview before commit
- Batch creates parcel records linked to manifest
- Org-scoped: manager can only upload to their organization's warehouses

**B. API Integration (V3)**

- Webhook endpoint for e-commerce platforms (requires API key auth + signature verification)
- Deferred to V3 due to security surface area

**C. Scan-In Station**

- For parcels arriving with existing labels
- Scan barcode → create/link parcel record
- Manual entry fallback

---

### 4. Route Optimization

**Capability:** Generate optimized stop sequence for parcels on a route.

**Integration with existing scheduling:**

- Existing `scheduling.ts` assigns **drivers to routes** (unchanged)
- Route optimization assigns **stop order to parcels within a route**
- Runs after parcels are assigned to a route, before driver shift starts

**Implementation:**

- Google OR-Tools for vehicle routing problem (VRP)
- Input: parcel addresses (geocoded), route constraints
- Output: `parcel.stopOrder` field updated

**Trigger points:**

- Manual: Manager clicks "Optimize" on route detail page
- Automatic: Cron job runs optimization for next-day routes at cutoff time

---

### 5. Discrepancy Management

**Capability:** Flag and resolve count mismatches between expected and actual deliveries.

**Detection:**

- At shift completion: compare `parcels.status = 'delivered'` count vs expected parcel count
- Threshold: any mismatch triggers review flag

**Resolution flow:**

1. Discrepancy flagged on assignment record (`hasDiscrepancy: true`)
2. Manager sees flagged shifts in dashboard
3. Manager reviews parcel event log vs driver-reported completion
4. Manager resolves: adjust parcel statuses or add notes

---

## Data Model Additions

```sql
-- Core parcel table
CREATE TABLE parcels (
  id UUID PRIMARY KEY,
  tracking_number VARCHAR UNIQUE NOT NULL,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  route_id UUID REFERENCES routes(id),  -- assigned route (nullable until assigned)
  manifest_id UUID REFERENCES manifests(id),  -- audit: which manifest created this

  -- Recipient
  recipient_name VARCHAR NOT NULL,
  recipient_address JSONB NOT NULL,
  recipient_phone VARCHAR,

  -- Physical
  weight_grams INTEGER,

  -- Status
  status VARCHAR NOT NULL DEFAULT 'pending',
  -- 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'attempted' | 'returned'
  stop_order INTEGER,

  -- Audit
  source VARCHAR NOT NULL,  -- 'manifest' | 'scan_in' | 'api'
  source_ref VARCHAR,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Delivery events (immutable log)
CREATE TABLE parcel_events (
  id UUID PRIMARY KEY,
  parcel_id UUID REFERENCES parcels(id) NOT NULL,
  assignment_id UUID REFERENCES assignments(id),  -- which shift recorded this
  driver_id UUID REFERENCES users(id),

  event_type VARCHAR NOT NULL,
  -- 'scanned_out' | 'delivered' | 'attempted' | 'returned' | 'status_change'

  -- Context
  timestamp TIMESTAMPTZ NOT NULL,
  latitude DECIMAL,
  longitude DECIMAL,
  notes TEXT,

  -- Offline sync tracking
  client_id VARCHAR,  -- client-generated UUID for idempotency
  client_timestamp TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Manifest uploads (audit)
CREATE TABLE manifests (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  filename VARCHAR NOT NULL,
  file_hash VARCHAR NOT NULL,
  parcel_count INTEGER NOT NULL,
  uploaded_by UUID REFERENCES users(id) NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add discrepancy flag to assignments
ALTER TABLE assignments ADD COLUMN has_discrepancy BOOLEAN DEFAULT FALSE;
ALTER TABLE assignments ADD COLUMN discrepancy_resolved_at TIMESTAMPTZ;
ALTER TABLE assignments ADD COLUMN discrepancy_resolved_by UUID REFERENCES users(id);
ALTER TABLE assignments ADD COLUMN discrepancy_notes TEXT;
```

**Indexes:**

```sql
CREATE INDEX idx_parcels_org ON parcels(organization_id);
CREATE INDEX idx_parcels_route ON parcels(route_id);
CREATE INDEX idx_parcels_status ON parcels(status);
CREATE INDEX idx_parcel_events_parcel ON parcel_events(parcel_id);
CREATE INDEX idx_parcel_events_assignment ON parcel_events(assignment_id);
CREATE UNIQUE INDEX idx_parcel_events_client_id ON parcel_events(client_id);
```

---

## Shift Count Migration

**Current:** `shifts` table has `parcelsStart`, `parcelsDelivered`, `parcelsReturned`, `exceptedReturns`

**Migration strategy:**

1. V2 launches with parcel-level tracking alongside shift counts
2. Shift completion derives counts from parcel events
3. Existing shift endpoints continue to work (backward compatible)
4. V3: Remove shift count fields, all queries use parcel events

**Health scoring update:**

- `completion_rate` calculation moves from `shifts.parcelsDelivered / shifts.parcelsStart`
- To: `COUNT(parcel_events WHERE event_type = 'delivered') / COUNT(parcels WHERE assignment_id = X)`

---

## API Endpoints

### Driver

- `POST /api/parcels/scan` — Record delivery event (idempotent via client_id)
- `GET /api/parcels/my-route` — Get parcels for current assignment in stop order
- `POST /api/parcels/sync` — Bulk sync queued scans from offline

### Manager

- `GET /api/parcels` — List parcels with filters (status, route, date, warehouse)
- `GET /api/parcels/:id` — Parcel detail with event history
- `POST /api/parcels/manifest` — Upload CSV manifest
- `GET /api/parcels/:id/label` — Generate single label PDF
- `POST /api/parcels/labels` — Generate bulk labels PDF
- `POST /api/routes/:id/optimize` — Trigger route optimization
- `GET /api/assignments/discrepancies` — List flagged assignments
- `PATCH /api/assignments/:id/resolve-discrepancy` — Resolve discrepancy

---

## UI Components

### Driver App

- `ParcelScanner.svelte` — Camera-based barcode scanner
- `DeliveryModal.svelte` — Post-scan actions (delivered, attempted, notes)
- `StopList.svelte` — Optimized stop sequence with parcel details
- `SyncBadge.svelte` — Pending sync count indicator

### Manager Dashboard

- `ManifestUpload.svelte` — CSV upload with preview/validation
- `ParcelTable.svelte` — Searchable parcel list with status filters
- `ParcelDetail.svelte` — Timeline of events
- `LabelGenerator.svelte` — Bulk label generation UI
- `DiscrepancyList.svelte` — Flagged assignments requiring review
- `DiscrepancyResolve.svelte` — Resolution modal

---

## Dependencies

| Dependency                  | Purpose               | Notes                     |
| --------------------------- | --------------------- | ------------------------- |
| `capacitor-barcode-scanner` | Mobile scanning       | Or `html5-qrcode` for PWA |
| `pdfkit`                    | PDF label generation  | Server-side               |
| `qrcode`                    | QR code generation    | For labels                |
| Google OR-Tools             | Route optimization    | Open source, self-hosted  |
| Geocoding API               | Address → coordinates | Google Maps or OpenCage   |

**Deferred to V3:**

- Object storage (photos)
- `node-zpl` (thermal printer labels)
- Webhook signature verification libs

---

## Implementation Phases

### Phase 1: Data Model + Basic CRUD

- Add `parcels`, `parcel_events`, `manifests` tables
- Add `has_discrepancy` fields to assignments
- Basic parcel list API + UI
- Drizzle schema + migrations

### Phase 2: Manifest Upload

- CSV upload endpoint with validation
- Preview + confirm flow
- Bulk parcel creation
- Manifest audit trail

### Phase 3: Label Generation

- PDF label generation with QR codes
- Single + bulk label endpoints
- Label download UI

### Phase 4: Driver Scanning

- Capacitor barcode scanner integration
- Scan → event recording flow
- IndexedDB offline queue
- Sync indicator + background sync

### Phase 5: Discrepancy Management

- Auto-flag on shift completion
- Manager discrepancy dashboard
- Resolution workflow

### Phase 6: Route Optimization

- OR-Tools integration
- Stop ordering algorithm
- Manual + cron triggers
- Driver stop list UI

### Phase 7: Shift Count Migration

- Update health scoring to use parcel events
- Update weekly reports to use parcel events
- Deprecation warnings on old endpoints

---

## Out of Scope (V2)

- Photo capture / proof of delivery images (V3)
- ZPL thermal printer labels (V3)
- Real-time tracking map (V3)
- Customer tracking portal (V3)
- Webhook API for e-commerce integration (V3)
- Weight/dimension capture (V3)
- Returns management workflow (V3)

---

## Files to Create/Modify

**New files:**

- `src/lib/server/db/schema/parcels.ts`
- `src/lib/server/db/schema/parcelEvents.ts`
- `src/lib/server/db/schema/manifests.ts`
- `src/lib/server/services/parcels.ts`
- `src/lib/server/services/labels.ts`
- `src/lib/server/services/routeOptimization.ts`
- `src/lib/stores/parcelSyncQueue.svelte.ts`
- `src/routes/api/parcels/+server.ts`
- `src/routes/api/parcels/[id]/+server.ts`
- `src/routes/api/parcels/manifest/+server.ts`
- `src/routes/api/parcels/scan/+server.ts`
- `src/routes/(driver)/parcels/+page.svelte`
- `src/lib/components/driver/ParcelScanner.svelte`
- `src/lib/components/manager/ManifestUpload.svelte`

**Modified files:**

- `src/lib/server/db/schema/assignments.ts` — Add discrepancy fields
- `src/lib/server/services/health.ts` — Update completion rate calculation
- `src/routes/api/weekly-reports/+server.ts` — Use parcel events for counts
