# Accessibility Implementation Patterns

This document provides detailed implementation patterns for accessibility requirements referenced in the main agent rules.

## 1. Interactive Elements Implementation

### 1.1 Required Attributes

- `role="button"` (or appropriate ARIA role)
- `tabindex="0"` (for keyboard focus)
- `aria-label` or appropriate labeling

### 1.2 Required Event Handlers

- `onclick` for mouse interaction
- `onkeydown` for keyboard interaction
- Must handle both Enter and Space keys

### 1.3 Example Implementation

```svelte
<div
	class="modal"
	role="button"
	tabindex="0"
	aria-label="Edit text"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
		}
	}}
>
```

### 1.4 Focus visibility styling

- Always rely on the global focus ring declared in `app.css` (do not restyle per component):

```css
/* app.css */
:focus-visible {
	outline: none;
	box-shadow: inset 0 0 0 var(--border-width-thin) var(--interactive-accent);
	border-radius: var(--radius-base);
	transition: none;
}
```

- Rationale: inset box-shadow hugs rounded corners, is themable, and remains consistent across all interactive elements.
- Avoid component-level overrides like `outline` or `box-shadow: none` on `:focus-visible` unless required for a special composite widget. If you must, prefer adding a utility class to the intended focus target instead of redefining the ring.
- If a hover background visually competes with the ring, remove the hover background for the focused state (e.g., a `noBackground` prop) rather than changing the ring.

## 2. ARIA Guidelines Checklist

All interactive elements must have:

- Appropriate ARIA role
- Descriptive aria-label or aria-labelledby
- aria-expanded for expandable elements
- aria-controls when controlling other elements
- aria-describedby for additional descriptions

## 3. Form Field Requirements

All form field elements (`input`, `textarea`, `select`, etc.) **MUST** have:

- A unique `id` attribute
- A corresponding `name` attribute

This is critical for browser autofill, accessibility, and to prevent warnings.

## 4. Non-interactive to Interactive Conversion Checklist

When converting a non-interactive element (like a div) to be interactive:

1. **Add Required Attributes**:
   - `role="button"` (or appropriate ARIA role)
   - `tabindex="0"` (for keyboard focus)
   - `aria-label` or appropriate labeling

2. **Add Required Event Handlers**:
   - `onclick` for mouse interaction
   - `onkeydown` for keyboard interaction
   - Must handle both Enter and Space keys
