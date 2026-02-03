# Navigation Patterns

URL state, breadcrumbs, and browser history for Drive pages.

## 1) URL-Driven State (SvelteKit Idiom)

**Always use `$page` store + `goto()` for URL state** — never `pushState`/`replaceState` directly.

```ts
import { page } from '$app/stores';
import { goto } from '$app/navigation';

// Read: reactive, auto-updates on back/forward
const category = $derived($page.url.searchParams.get('category') ?? 'default');

// Write: pushes history entry by default
function setCategory(value: string) {
	const url = new URL($page.url);
	url.searchParams.set('category', value);
	goto(url, { keepFocus: true, noScroll: true });
}
```

**Why not `pushState`/`replaceState`?**

- `$page` won't update (requires manual `popstate` listener)
- Bypasses SvelteKit's navigation lifecycle
- Breaks back/forward without extra code

**When to omit query param** (keep URLs clean):

```ts
if (value === 'default') {
	url.searchParams.delete('category');
} else {
	url.searchParams.set('category', value);
}
```

## 2) Page Header Store

All `/app/*` pages share a single `<PageHeader>` in the layout. Configure it via `pageHeaderStore`:

```ts
import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
import { goto } from '$app/navigation';
import { onDestroy } from 'svelte';

// Set in $effect (reactive to state changes)
$effect(() => {
  pageHeaderStore.configure({
    title: 'Page Title',
    breadcrumbs: [...]
  });
});

// Always reset on destroy
onDestroy(() => pageHeaderStore.reset());
```

### Breadcrumb Structure

```ts
type Breadcrumb = {
	label: string;
	onSelect?: () => void; // Click handler (navigate or change view)
	onBack?: () => void; // Reserved (not currently rendered by PageHeader)
};
```

**Standard pattern** (2-3 crumbs: Home -> Section -> Subsection):

```ts
const breadcrumbs = $derived.by(() => [
	{ label: 'Home', onSelect: () => goto('/dashboard') },
	{ label: 'Settings', onSelect: () => (view = 'list') },
	{ label: activeSection }
]);
```

- `onSelect`: what happens when the user clicks the crumb

### Config Options

```ts
interface PageHeaderConfig {
	title: string;
	breadcrumbs?: Breadcrumb[];
	actionsSnippet?: Snippet;
}
```

## 3) Module Patterns

### Sidebar + Content (Settings, Document Bay)

Desktop: sidebar always visible, no back button needed.
Mobile: drill-down with `view` state (`'list' | 'details'`).

```ts
let view: 'list' | 'details' = $state('list');

function selectItem(item: Item) {
  activeItem = item;
  if (isMobile) view = 'details';
}

// Breadcrumb back returns to list on mobile
{ label: activeItem, onBack: isMobile ? () => (view = 'list') : undefined }
```

### Page vs Modal Mode

Some modules render as pages or modals. Only configure `pageHeaderStore` in page mode:

```ts
$effect(() => {
	if (mode === 'page') {
		pageHeaderStore.configure({ title, breadcrumbs });
	}
});
```

### No Breadcrumbs

For primary surfaces without hierarchical nav:

```ts
pageHeaderStore.configure({ title: 'Editor', breadcrumbs: [] });
```

## 4) Anti-Patterns

| ❌ Don't                                          | ✅ Do                               |
| ------------------------------------------------- | ----------------------------------- |
| `replaceState()` for category changes             | `goto(url)` — pushes history        |
| `pushState()` + manual `popstate` listener        | `$page.url.searchParams` — reactive |
| Read `window.location.href`                       | Read `$page.url`                    |
| Forget `onDestroy(() => pageHeaderStore.reset())` | Always reset on unmount             |

## 5) Reference

- **Settings**: `src/routes/(app)/settings/+page.svelte`
- **Store**: `src/lib/stores/app-shell/pageHeaderStore.svelte.ts`
- **Schema**: `src/lib/schemas/ui/breadcrumb.ts`
