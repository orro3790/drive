# Error Handling Protocol

This document standardizes how errors are displayed across Drive.

## Two Types of Errors

### 1. API/Server Errors → Toast

When a server operation fails (network error, permission denied, rate limit, etc.), use the toast system:

```ts
import { toastStore } from '$lib/stores/app-shell/toastStore.svelte';

try {
	const res = await fetch('/api/...');
	if (!res.ok) throw new Error(await res.text());
} catch (err) {
	toastStore.error(err.message, 'Save failed');
}
```

**Use toasts for:**

- Network failures
- Permission errors
- Rate limits
- Server errors (500s)
- Settings toggles that fail to persist

### 2. Form Validation Errors → Inline Display

When user input is invalid, show errors **inline below the field**. This draws the user's eye to exactly what needs fixing.

Render validation errors inline, adjacent to the field.

**Use inline errors for:**

- Invalid email format
- Required field empty
- Value out of range
- Pattern mismatch

---

## Component Error Support

### Components WITH Built-in Error Display

These components accept an `errors` prop and display errors inline:

| Component  | Usage                                  |
| ---------- | -------------------------------------- |
| `Select`   | Simple dropdown selects (static lists) |
| `Combobox` | Filterable selects with search         |

`InlineEditor` does not currently render its own error list; render a `.field-error` element below it (see `src/routes/(manager)/warehouses/+page.svelte`).

**API:**

```ts
errors?: string[]   // Array of error messages
maxErrors?: number  // Max to show before "+N more" (default: 3)
```

**Behavior:**

- Errors appear below the field with a slide-down animation
- Input border turns red
- Errors persist until cleared (not transient)
- Screen readers announce via `role="alert"`

### Components WITHOUT Built-in Error Display

These components are typically used in contexts where validation is handled differently:

| Component    | Error Handling                                 |
| ------------ | ---------------------------------------------- |
| `Checkbox`   | Display error adjacent at form level           |
| `RadioGroup` | Display error adjacent at form level           |
| `Toggle`     | Server errors → toast; revert state on failure |

For Checkbox/RadioGroup in forms, display the error message adjacent to the component:

```svelte
<Checkbox checked={agreed} label="I agree to terms" />
{#if agreeError}
	<span class="field-error">{agreeError}</span>
{/if}
```

---

## Form Validation Pattern

### Parse with Zod, Display Inline

1. Define a Zod schema for your form
2. On submit, parse with `.safeParse()`
3. Map `fieldErrors` to each input's `errors` prop

```svelte
<script lang="ts">
	import { z } from 'zod';

	const schema = z.object({
		email: z.string().email('Invalid email'),
		name: z.string().min(1, 'Name is required')
	});

	let email = $state('');
	let name = $state('');
	let formErrors = $state<Record<string, string[]>>({});

	async function handleSubmit() {
		formErrors = {};
		const result = schema.safeParse({ email, name });
		if (!result.success) {
			formErrors = result.error.flatten().fieldErrors;
			return;
		}
		// Submit to API...
	}
</script>

<InlineEditor value={email} onInput={(v) => (email = v)} />
{#if formErrors.email}
	<p class="field-error" role="alert">{formErrors.email[0]}</p>
{/if}

<InlineEditor value={name} onInput={(v) => (name = v)} />
{#if formErrors.name}
	<p class="field-error" role="alert">{formErrors.name[0]}</p>
{/if}
```

### Server Validation Errors

When the API returns structured validation errors, map them to fields:

```ts
const body = await res.json();
if (!res.ok && body?.errors?.fieldErrors) {
	emailErrors = body.errors.fieldErrors.email ?? [];
	nameErrors = body.errors.fieldErrors.name ?? [];
}
```

---

## Quick Reference

| Scenario                      | Action                                   |
| ----------------------------- | ---------------------------------------- |
| Invalid form field            | Pass errors to component's `errors` prop |
| API request failed            | `toastStore.error(message, title)`       |
| Settings toggle failed        | Toast + revert toggle state              |
| Required checkbox not checked | Display error adjacent to checkbox       |
| List failed to load           | Toast + show empty/retry state           |

---

## Accessibility

- Inline errors use `role="alert"` and `aria-live="polite"` for screen reader announcement
- Inputs with errors have `aria-invalid="true"`
- Error container is linked via `aria-describedby`
- Toasts do not trap focus

---

## References

- `src/lib/stores/app-shell/toastStore.svelte.ts` — toast API
- `src/lib/utils/errorDisplay.ts` — shared error display utility
- `src/lib/components/InlineEditor.svelte` — reference implementation
