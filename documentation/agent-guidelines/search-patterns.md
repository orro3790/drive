# Search Patterns Guide (Legacy)

_Last Updated: January 05, 2026_

## 1. Overview

Status: LEGACY (copied from a previous project). Drive does not currently use Typesense search or the referenced search utilities. Keep for reference only; update if/when Drive adds search.

## 2. Consuming Search in UI Components

### 2.1. Using DataSource Factories

For Combobox/autocomplete components, use the provided dataSource factories:

```typescript
import {
	createStudentDataSource,
	createMaterialDataSource,
	createClassDataSource,
	createStaffDataSource,
	type ComboboxDataSource
} from '$lib/utils/api/search';

// Basic usage
const dataSource = createStudentDataSource();

// With filters
const dataSource = createStudentDataSource({
	status: 'active',
	classId: someClassId
});
```

### 2.2. Available DataSource Factories

| Factory                      | Filters             | Use Case                    |
| ---------------------------- | ------------------- | --------------------------- |
| `createStudentDataSource()`  | `status`, `classId` | Student pickers, assignment |
| `createMaterialDataSource()` | `type`              | Material pickers            |
| `createClassDataSource()`    | `status`            | Class pickers               |
| `createStaffDataSource()`    | `accountStatus`     | Staff/teacher pickers       |

### 2.3. Combobox Integration

```svelte
<script lang="ts">
	import Combobox from '$lib/components/Combobox.svelte';
	import { createStudentDataSource } from '$lib/utils/api/search';

	let selectedStudent = $state<string | null>(null);
	const dataSource = createStudentDataSource({ status: 'active' });
</script>

<Combobox bind:value={selectedStudent} {dataSource} placeholder="Search students..." />
```

### 2.4. Custom Filtering

When you need client-side filtering (e.g., excluding already-selected items):

```typescript
const baseDataSource = createMaterialDataSource();
const excludeIds = new Set(['mat1', 'mat2']);

const filteredDataSource: ComboboxDataSource = {
	async fetchPage(args) {
		const result = await baseDataSource.fetchPage(args);
		return {
			...result,
			options: result.options.filter((opt) => !excludeIds.has(String(opt.value)))
		};
	},
	fetchById: baseDataSource.fetchById
};
```

### 2.5. Error Handling

DataSource factories handle errors gracefully:

- Network errors return empty results
- The `fetchById` fallback fetches from Firestore when Typesense is unavailable

For critical pickers, wrap with error notification:

```typescript
const dataSource: ComboboxDataSource = {
	async fetchPage(args) {
		try {
			return await baseDataSource.fetchPage(args);
		} catch (error) {
			toaster.error('search.error.unavailable');
			return { options: [], page: 1, hasMore: false };
		}
	},
	fetchById: baseDataSource.fetchById
};
```

## 3. Adding a New Searchable Entity

### 3.1. Step-by-Step Checklist

1. **Create collection schema** in `src/lib/server/services/search/collections/`
2. **Add search function** to `typesenseSearchService.ts`
3. **Create API endpoint** in `src/routes/api/search/{entity}/+server.ts`
4. **Add dataSource factory** to `src/lib/utils/api/search.ts`
5. **Create Cloud Function trigger** in `functions/src/search/`
6. **Update setup script** in `scripts/typesense-setup.ts`
7. **Provision collection** via `pnpm tsx scripts/typesense-setup.ts provision`

### 3.2. Collection Schema Pattern

```typescript
// src/lib/server/services/search/collections/{entity}Collection.ts
import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';
import { z } from 'zod';

export const ENTITY_COLLECTION_NAME = 'entities';

export const entityCollectionSchema: CollectionCreateSchema = {
	name: ENTITY_COLLECTION_NAME,
	fields: [
		// Required identity fields
		{ name: 'id', type: 'string' },
		{ name: 'orgId', type: 'string', facet: true },

		// Searchable text fields
		{ name: 'name', type: 'string' },
		{ name: 'nameLower', type: 'string', sort: true }, // IMPORTANT: sort: true for alphabetical
		{ name: 'description', type: 'string', optional: true },

		// Filter fields (use facet: true for filtering)
		{ name: 'status', type: 'string', facet: true },
		{ name: 'tagIds', type: 'string[]', facet: true },

		// Sorting fields
		{ name: 'createdAt', type: 'int64' },
		{ name: 'updatedAt', type: 'int64' }
	],
	default_sorting_field: 'updatedAt'
};

// Zod schema for type-safe document handling
export const entitySearchDocumentSchema = z.object({
	id: z.string(),
	orgId: z.string(),
	name: z.string(),
	nameLower: z.string(),
	description: z.string().optional(),
	status: z.enum(['active', 'archived']),
	tagIds: z.array(z.string()),
	createdAt: z.number(),
	updatedAt: z.number()
});

export type EntitySearchDocument = z.infer<typeof entitySearchDocumentSchema>;
```

### 3.3. Search Service Pattern

```typescript
// In typesenseSearchService.ts

export async function searchEntities(options: SearchOptions): Promise<SearchResponse> {
	const client = getTypesenseClient();
	const { query, orgId, limit = 25, page = 1, filters = {} } = options;

	// Build filter string - ALWAYS include orgId
	const filterParts = [`orgId:=${orgId}`];
	if (filters.status) {
		filterParts.push(`status:=${filters.status}`);
	}

	const searchParams: SearchParams = {
		q: query || '*',
		query_by: 'name,nameLower,description', // Fields to search
		filter_by: filterParts.join(' && '),
		per_page: limit,
		page,
		// Sort by relevance when searching, alphabetically when browsing
		sort_by: query ? '_text_match:desc,updatedAt:desc' : 'nameLower:asc',
		num_typos: 2
	};

	const result = await client.collections(ENTITY_COLLECTION_NAME).documents().search(searchParams);

	return {
		options: (result.hits || []).map((hit) => ({
			value: String(hit.document.id),
			label: String(hit.document.name),
			meta: hit.document
		})),
		page: result.page,
		hasMore: result.found > page * limit,
		totalFound: result.found
	};
}
```

### 3.4. API Endpoint Pattern

```typescript
// src/routes/api/search/entities/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { entitySearchRequestSchema } from '$lib/schemas/api/search';
import { searchEntities } from '$lib/server/services/search/typesenseSearchService';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Auth check - orgId comes from session, NEVER from request
	if (!locals.uid || !locals.orgContext?.orgId) {
		throw error(401, { message: 'Unauthorized' });
	}

	const body = await request.json();
	const parsed = entitySearchRequestSchema.safeParse(body);
	if (!parsed.success) {
		throw error(400, { message: 'Invalid request' });
	}

	const result = await searchEntities({
		...parsed.data,
		orgId: locals.orgContext.orgId // From session, not request!
	});

	return json(result);
};
```

### 3.5. DataSource Factory Pattern

```typescript
// In src/lib/utils/api/search.ts

export function createEntityDataSource(filters: EntitySearchFilters = {}): ComboboxDataSource {
	return {
		async fetchPage({ query, cursor, limit }) {
			const response = await fetch('/api/search/entities', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: query ?? '',
					limit: limit ?? 25,
					page: typeof cursor === 'number' ? cursor : 1,
					...filters
				})
			});

			if (!response.ok) {
				return { options: [], page: 1, hasMore: false };
			}

			const data = await response.json();
			return {
				options: data.options,
				cursor: data.page + 1,
				hasMore: data.hasMore
			};
		},

		async fetchById(value) {
			// Fallback to direct Firestore fetch for hydration
			const response = await fetch(`/api/entities/${value}`);
			if (!response.ok) return null;
			const entity = await response.json();
			return entity ? { value: entity.id, label: entity.name } : null;
		}
	};
}
```

### 3.6. Cloud Function Sync Pattern

```typescript
// functions/src/search/syncEntity.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getTypesenseClient } from './typesenseSync';
import { ENTITY_COLLECTION_NAME } from './collections/entityCollection';
import { logger } from 'firebase-functions/v2';

export const syncEntityToTypesense = onDocumentWritten(
	{
		document: 'entities/{entityId}',
		region: 'us-central1'
	},
	async (event) => {
		const client = getTypesenseClient();
		const { entityId } = event.params;

		try {
			if (!event.data?.after?.exists) {
				// Delete
				await client
					.collections(ENTITY_COLLECTION_NAME)
					.documents(entityId)
					.delete()
					.catch((err) => {
						if (err.httpStatus !== 404) throw err;
					});
				logger.info(`Deleted entity ${entityId} from search`);
				return;
			}

			const data = event.data.after.data();

			// Map Firestore document to search document
			const searchDoc = {
				id: entityId,
				orgId: data.orgId,
				name: data.name,
				nameLower: data.nameLower || data.name.toLowerCase(),
				description: data.description || '',
				status: data.status || 'active',
				tagIds: data.tagIds || [],
				createdAt: data.metadata?.createdAt?.toMillis() || Date.now(),
				updatedAt: data.metadata?.updatedAt?.toMillis() || Date.now()
			};

			await client.collections(ENTITY_COLLECTION_NAME).documents().upsert(searchDoc);

			logger.info(`Synced entity ${entityId} to search`);
		} catch (error) {
			logger.error(`Failed to sync entity ${entityId}:`, error);
			throw error;
		}
	}
);
```

## 4. Common Pitfalls

### 4.1. Missing `sort: true` on String Fields

Typesense requires `sort: true` on string fields used for sorting:

```typescript
// WRONG - will error when sorting by nameLower
{ name: 'nameLower', type: 'string' }

// CORRECT
{ name: 'nameLower', type: 'string', sort: true }
```

### 4.2. OrgId from Request Body

Never accept `orgId` from the request body - always use `locals.orgContext.orgId`:

```typescript
// WRONG - security vulnerability
const result = await search({ orgId: body.orgId, ... });

// CORRECT
const result = await search({ orgId: locals.orgContext.orgId, ... });
```

### 4.3. Timestamps from Wrong Location

In the legacy system, timestamps were stored in `metadata.createdAt`, not at the document root:

```typescript
// WRONG
createdAt: data.createdAt?.toMillis();

// CORRECT
createdAt: data.metadata?.createdAt?.toMillis() || Date.now();
```

### 4.4. Forgetting to Update Setup Script

After adding a new collection, update `scripts/typesense-setup.ts`:

1. Import the new schema
2. Add to the `schemas` array in `provisionCollections()` and `recreateCollections()`
3. Add collection name to `showStats()` collections array

## 5. Testing Search

### 5.1. Using the Setup Script

```bash
# Test connection
pnpm tsx scripts/typesense-setup.ts test

# Check document counts
pnpm tsx scripts/typesense-setup.ts stats

# Search students (default collection)
pnpm tsx scripts/typesense-setup.ts search "kim"
```

### 5.2. Browser Testing

1. Open the page with the Combobox
2. Type a search query
3. Verify results appear (check Network tab for 200 response)
4. Verify pagination loads more results on scroll
5. Verify selected item hydrates correctly on page refresh

## 6. Agentic Search (Phase 5)

Phase 5 collections are designed for AI tool-calling, returning full document data instead of SelectOption format.

### 6.1. Agentic Collections

| Collection               | Purpose                                       | Use Case                                                       |
| ------------------------ | --------------------------------------------- | -------------------------------------------------------------- |
| `lesson_student_records` | Teacher comments about participation/homework | "Search Jason's lesson comments for mentions of participation" |
| `documents`              | Student writing and published feedback        | "Find documents where the student struggled with grammar"      |
| `error_classifications`  | Error types and categories                    | "What error codes relate to verb tense?"                       |

### 6.2. Agentic Response Format

Unlike UI search (which returns `SelectOption[]`), agentic search returns full document data:

```typescript
// AgenticSearchResponse
{
	hits: Array<Record<string, unknown>>; // Full document data
	page: number;
	totalFound: number;
	hasMore: boolean;
}
```

### 6.3. Calling Agentic Endpoints

```typescript
// Search lesson student records
const response = await fetch('/api/search/lesson-student-records', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		query: 'participation',
		studentId: 'student123', // Optional filter
		limit: 10
	})
});

// Search writing documents
const response = await fetch('/api/search/writing-documents', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		query: 'verb tense',
		studentId: 'student123',
		isPublished: true,
		limit: 10
	})
});

// Search error classifications
const response = await fetch('/api/search/error-classifications', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		query: 'grammar',
		category: 'grammar',
		limit: 10
	})
});
```

### 6.4. Adding a New Agentic Collection

Follow the same pattern as Phase 4 collections (see Section 3), but:

1. Return `AgenticSearchResponse` instead of `SearchResponse`
2. Don't create dataSource factories (not used by Combobox)
3. Use `agenticSearchResponseSchema` for the response type
4. Full document data in hits array instead of SelectOption mapping

## 7. Architecture Reference

For complete architecture details, see:

- (Legacy note) The referenced Typesense architecture docs were not copied into Drive.
- No Drive-local Typesense integration plan is currently checked in.
