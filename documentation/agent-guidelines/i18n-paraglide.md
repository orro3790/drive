# Internationalization (i18n) with Paraglide JS

This project uses **Paraglide JS v2** for internationalization. All user-facing strings MUST use message functions — never hardcode text.

## Quick Reference

### Import Messages

```svelte
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
</script>
```

### Use Message Functions

```svelte
<!-- In templates -->
<h1>{m.page_title()}</h1>
<button>{m.button_save()}</button>
<span aria-label={m.accessibility_label()}></span>

<!-- In data structures -->
const items = [
  { label: m.nav_home(), href: '/' },
  { label: m.nav_settings(), href: '/settings' }
];
```

### Add New Messages

1. Add the key to `messages/en.json`:

   ```json
   {
   	"my_new_message": "Hello {name}",
   	"button_submit": "Submit"
   }
   ```

2. Add Chinese translation to `messages/zh.json`:

   ```json
   {
   	"my_new_message": "你好 {name}",
   	"button_submit": "提交"
   }
   ```

3. Restart dev server to regenerate typed functions.

4. Use in component: `m.my_new_message({ name: userName })`

## Naming Convention

Use descriptive keys: `{location}_{element}_{description}`

| Key Pattern                | Example                          | Use Case             |
| -------------------------- | -------------------------------- | -------------------- |
| `{page}_title`             | `settings_title`                 | Page titles          |
| `{page}_{section}_title`   | `settings_appearance_title`      | Section headers      |
| `{component}_label_{name}` | `sidebar_nav_students`           | Navigation items     |
| `button_{action}`          | `button_save`, `button_cancel`   | Common buttons       |
| `common_{term}`            | `common_loading`, `common_error` | Reusable terms       |
| `aria_{purpose}`           | `aria_close_modal`               | Accessibility labels |

## What MUST Be Tokenized

- ✅ Page titles and headers
- ✅ Button labels
- ✅ Navigation items
- ✅ Form labels and placeholders
- ✅ Error messages shown to users
- ✅ Tooltips and aria-labels
- ✅ Toast/notification messages
- ✅ Empty state messages

## What Should NOT Be Tokenized

- ❌ Log messages (server-side only)
- ❌ Developer-facing error messages
- ❌ Code comments
- ❌ Date format patterns (these are format strings, not display text)
- ❌ URLs and paths

## Locale-Aware Considerations

### Fonts

Avoid locale-specific font imports. If locale-specific typography becomes necessary, prefer CSS `:lang(...)` selectors and keep changes token-driven.

### URL Routing

Drive does not use locale-prefixed routes. Locale switching is handled by Paraglide runtime (`getLocale()` / `setLocale()`), not by URL prefixes.

### Getting/Setting Locale

```typescript
import { getLocale, setLocale, locales } from '$lib/paraglide/runtime.js';

// Get current locale
const current = getLocale(); // 'en' | 'zh'

// Change locale (triggers navigation)
setLocale('zh');

// Available locales
console.log(locales); // ['en', 'zh']
```

## Migration Strategy

This project follows "tokenize first":

1. **New features**: MUST use Paraglide messages for all user-facing text
2. **Existing features**: Tokenize as you touch them
3. **Dedicated sweep**: Schedule cleanup tasks before expanding language support

## Files Overview

| File                            | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `messages/en.json`              | English source messages                                      |
| `messages/zh.json`              | Chinese translations                                         |
| `project.inlang/settings.json`  | Paraglide configuration                                      |
| `src/lib/paraglide/messages.js` | Generated message functions                                  |
| `src/lib/paraglide/runtime.js`  | Locale utilities                                             |
| `src/hooks.server.ts`           | Server-side middleware                                       |
| `vite.config.ts`                | Paraglide Vite plugin config (`outdir: ./src/lib/paraglide`) |

## Common Patterns

### Conditional Text

```svelte
<span>{isActive ? m.status_active() : m.status_inactive()}</span>
```

### Pluralization / Parameters

```json
{
	"items_count": "{count, plural, =0 {No items} =1 {1 item} other {# items}}"
}
```

```svelte
{m.items_count({ count: items.length })}
```

### Dynamic Navigation

```typescript
const navGroups = [
	{
		label: m.sidebar_group_management(),
		items: [{ id: 'students', label: m.sidebar_nav_students() }]
	}
];
```
