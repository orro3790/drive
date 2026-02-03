# Smart Store Pattern (Svelte 5)

Drive uses "smart stores" for feature-domain state. Stores own data, async calls, optimistic updates, and UI flags.

## 1) Core Rules

- One top-level `$state` object per store.
- Stores expose a single exported object (`warehouseStore`, `routeStore`, etc.) with getters + methods.
- Components derive state from store getters and call store methods. Keep components thin.

## 2) File Naming + Placement

- `src/lib/stores/<domain>Store.svelte.ts`

Examples:

- `src/lib/stores/warehouseStore.svelte.ts`
- `src/lib/stores/routeStore.svelte.ts`

## 3) Canonical Shape

```ts
const state = $state({
	items: [],
	isLoading: false,
	error: null as string | null
});

export const exampleStore = {
	get items() {
		return state.items;
	},
	get isLoading() {
		return state.isLoading;
	},
	async load() {
		state.isLoading = true;
		state.error = null;
		try {
			// fetch + set state
		} catch (err) {
			state.error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			state.isLoading = false;
		}
	}
};
```

## 4) Optimistic Mutations

Pattern:

1. UI calls a store method (do not `await` from the UI event handler).
2. Store mutates state immediately.
3. Store triggers a background async call.
4. On success: reconcile state with server response.
5. On failure: revert state + show toast.

In Drive, internal background methods commonly use an underscore prefix (e.g., `_createInDb`).

See `documentation/agent-guidelines/optimistic-ui-patterns.md`.

## 5) References

- `src/lib/stores/warehouseStore.svelte.ts`
- `src/lib/stores/routeStore.svelte.ts`
- `src/lib/stores/bidsStore.svelte.ts`
