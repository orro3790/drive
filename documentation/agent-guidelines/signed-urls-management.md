# Signed URLs Management

Last updated: 2025-12-25

Status: LEGACY (copied from a previous project). Drive does not currently use GCS signed URLs or the referenced storage services/utilities.

## Quick Reference

- **Server service:** `src/lib/server/services/storage/signedUrlService.ts`
- **API endpoint:** `POST /api/storage/signed-urls`
- **Client utility:** `src/lib/utils/signedUrls.ts`
- **Storage bucket:** `GCS_STORAGE_BUCKET` (single unified bucket)

## Ownership Rules

| Path Prefix                    | Requires           |
| ------------------------------ | ------------------ |
| `materials/{orgId}/*`          | `orgContext.orgId` |
| `material-instances/{orgId}/*` | `orgContext.orgId` |
| `material-events/{orgId}/*`    | `orgContext.orgId` |
| `students/{orgId}/*`           | `orgContext.orgId` |
| `org-settings/{orgId}/*`       | `orgContext.orgId` |
| `users/{userId}/*`             | matching `userId`  |
| `settings/{userId}/*`          | matching `userId`  |

## Usage

### Client-Side

```typescript
import { generateSignedUrls } from '$lib/utils/signedUrls';

const urlMap = await generateSignedUrls(['gs://bucket/materials/org123/image.jpg']);
const displayUrl = urlMap.get('gs://bucket/materials/org123/image.jpg');
```

### Server-Side (custom validation)

```typescript
import { generateSignedUrls } from '$lib/server/services/storage/signedUrlService';

const results = await generateSignedUrls(gcsUris, { userId, orgId });
```

## Adding New Resource Types

1. Update `signedUrlService.ts`:
   - Add to `ResourceType` union
   - Add path check in `inferResourceType()`
   - Add validation in `validateOwnership()`
2. Update this doc's ownership table

## Rules

- Store only GCS URIs (`gs://...`) in Firestore, never signed URLs
- Never log signed URLs
- Client treats URLs as expired when <24h remaining
