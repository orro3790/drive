# Free Tier Limits & Premium Feature Gating Architecture (Legacy)

## Summary

Status: LEGACY (copied from a previous project). Drive does not currently implement this trial/premium gating architecture. Keep for reference only.

The legacy system used **three separate systems** to protect the platform:

1. **Free Tier Limits** — Quota-based limits on document creation (Notion-style "block" counting)
2. **Premium Feature Gating** — Subscription-based access to AI/OCR features
3. **Rate Limiting** — Technical safeguards against abuse/DDOS (token bucket algorithm)

These are intentionally decoupled: free tier limits are fail-closed (deny on error), rate limits are fail-open (allow on error).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Endpoint                             │
├─────────────────────────────────────────────────────────────────┤
│  withApiMetrics(                                                │
│    withRateLimit(tier,              ← Abuse prevention          │
│      withFreeTierLimit(             ← Document quota (optional) │
│        handler                                                  │
│      )                                                          │
│    )                                                            │
│  )                                                              │
│                                                                 │
│  OR for premium features (AI/OCR):                              │
│                                                                 │
│  withApiMetrics(                                                │
│    withRateLimit(tier,              ← Abuse prevention          │
│      withPremiumRequired(           ← Subscription check        │
│        handler                                                  │
│      )                                                          │
│    )                                                            │
│  )                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## System 1: Free Tier Limits (Quota-Based)

### Purpose

Enforce organization-level caps on document creation. Documents are renewable (quota decreases on delete).

### Key Files

- `src/lib/schemas/usage.ts` — Schema for `OrgUsageAggregate` and `FREE_TIER_LIMITS`
- `src/lib/server/services/usage/usageService.ts` — Service for checking/updating usage
- `src/lib/server/withFreeTierLimit.ts` — HOF wrapper for endpoints

### Limits (Current Defaults)

| Resource        | Limit | Renewable?                |
| --------------- | ----- | ------------------------- |
| Total Documents | 5000  | Yes (decrement on delete) |
| Storage Files   | 500   | Yes                       |

"Documents" = students + classes + documents + templates + materials + material_events

### Data Model

```
organizations/{orgId}/aggregates/usage
├── totalDocuments: number
├── totalStorageFiles: number
├── totalStorageBytes: number
├── llmCallsUsed: number (DEPRECATED - retained for audit trail)
├── ocrUploadsUsed: number (DEPRECATED - retained for audit trail)
└── lastReconciled: Timestamp
```

### Usage Pattern

**On Create:**

```typescript
import { withFreeTierLimit } from '$lib/server/withFreeTierLimit';
import { incrementDocuments } from '$lib/server/services/usage/usageService';

export const POST = withApiMetrics(
	'/api/documents/create',
	withRateLimit(
		'moderate',
		withFreeTierLimit(async ({ locals }) => {
			// ... create resource ...
			await incrementDocuments(locals.orgContext.orgId);
			return json({ success: true });
		})
	)
);
```

**On Delete:**

```typescript
import { decrementDocuments } from '$lib/server/services/usage/usageService';

// After successful deletion:
await decrementDocuments(orgId, 1);
```

### Error Response (403)

```json
{
	"success": false,
	"error": {
		"message": "You have reached your free tier limit for documents.",
		"code": "FREE_TIER_LIMIT_REACHED",
		"reason": "trial_documents_limit_reached",
		"nextRequired": "subscription"
	}
}
```

### Fail-Closed Policy

For free tier limits, if Firestore is unavailable, **deny the request** to prevent unbounded resource creation.

## System 1b: Premium Feature Gating (Subscription-Based)

### Purpose

Restrict AI analysis, OCR, and other premium features to organizations with active premium subscriptions.

### Key Files

- `src/lib/server/withPremiumRequired.ts` — HOF wrapper for premium endpoints

### Access Requirements

- `subscriptionTier === 'premium'` AND `subscriptionStatus === 'active'`
- Both conditions must be true

### Usage Pattern

```typescript
import { withPremiumRequired } from '$lib/server/withPremiumRequired';

export const POST = withApiMetrics(
	'/api/templates/ai-synthesize',
	withRateLimit(
		'expensive',
		withPremiumRequired(async ({ locals }) => {
			// ... AI feature logic ...
			return json({ result });
		})
	)
);
```

### Error Response (403)

```json
{
	"success": false,
	"error": {
		"message": "This feature requires a Premium subscription.",
		"code": "SUBSCRIPTION_REQUIRED",
		"reason": "subscription_required",
		"nextRequired": "subscription"
	}
}
```

### When to Use

Use `withPremiumRequired` for:

- AI writing analysis (`/api/templates/ai-synthesize`)
- OCR image processing (`/api/uploads/session/[id]/image`)
- Worksheet generation (`/api/worksheets/generate`)
- Any other premium-exclusive features

Use `withFreeTierLimit` for:

- Document creation (students, classes, documents, templates)
- Material management
- Any quota-based resource limits

## System 2: Rate Limiting (Abuse Prevention)

### Purpose

Prevent abuse, DDOS, and runaway automation. Honest users should never hit these limits.

### Key Files

- `src/lib/schemas/rateLimitBucket.ts` — Schema for token buckets
- `src/lib/server/services/rateLimit/tokenBucketService.ts` — Token bucket implementation
- `src/lib/server/withRateLimit.ts` — HOF wrapper for endpoints

### Token Bucket Algorithm

Each user has three buckets (one per tier):

| Tier        | Bucket Size | Refill Rate | Use Case               |
| ----------- | ----------- | ----------- | ---------------------- |
| `expensive` | 20 tokens   | 1/sec       | LLM, OCR, file uploads |
| `moderate`  | 30 tokens   | 2/sec       | Creates, updates       |
| `cheap`     | 100 tokens  | 5/sec       | Reads, listings        |

**Math:**

```typescript
currentTokens = min(bucketSize, tokens + elapsedSeconds × refillRate)
```

### Data Model

```
users/{uid}/rate_limits/current
├── buckets: { expensive: {...}, moderate: {...}, cheap: {...} }
└── expiresAt: Timestamp  // TTL for auto-cleanup
```

### Usage Pattern

```typescript
import { withRateLimit } from '$lib/server/withRateLimit';

export const POST = withApiMetrics(
	'/api/students/create',
	withRateLimit('moderate', async ({ locals }) => {
		// ... handler logic ...
	})
);
```

### Error Response (429)

```json
{
	"success": false,
	"error": {
		"message": "Too many requests. Please try again shortly.",
		"code": "RATE_LIMITED",
		"retryAfterSeconds": 5
	}
}
```

Headers: `Retry-After: 5`

### Fail-Open Policy

For rate limiting, if Firestore is unavailable, **allow the request**. Rate limiting is a safeguard, not a gatekeeper.

## Client-Side Handling

### fetchWithGate() (Legacy)

The legacy project used a `fetchWithGate()` helper (not present in Drive) to handle:

- **401**: Session expired → redirect to login
- **403**: Free tier limit → `handleTrialGate()` shows upgrade prompt
- **429**: Rate limited → toast with retry timer

### trialAccessPrompt()

Maps `reason` codes to user-friendly prompts:

- `subscription_required` → "Premium Feature" (for AI/OCR)
- `trial_documents_limit_reached` → "Document Limit Reached"

## Reconciliation

A scheduled Cloud Function runs every 24 hours to reconcile usage aggregates:

```
functions/src/index.ts → scheduledUsageReconciliation
```

This ensures counts stay accurate even if increment/decrement calls fail.

## Quick Reference

| Task                               | Use                            |
| ---------------------------------- | ------------------------------ |
| Add rate limiting to endpoint      | `withRateLimit(tier, handler)` |
| Add document quota limit           | `withFreeTierLimit(handler)`   |
| Add premium feature gate           | `withPremiumRequired(handler)` |
| Increment doc count on create      | `incrementDocuments(orgId)`    |
| Decrement doc count on delete      | `decrementDocuments(orgId)`    |
| Check if user can create more docs | `checkDocumentLimit(orgId)`    |
| Get bucket status (debug)          | `getBucketStatus(uid, tier)`   |

## See Also

- Error handling: `documentation/agent-guidelines/error-handling-protocol.md`
- Authentication: `documentation/agent-guidelines/authentication-patterns.md`
