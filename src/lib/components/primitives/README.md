# UI Primitives

This directory contains low-level, reusable UI components ("primitives") with strict accessibility and API guarantees.

## Purpose

Primitives are:

- **Foundational**: Used as building blocks by higher-level composites in `lib/components/`.
- **Consistent**: Follow uniform prop/event naming and accessibility patterns.
- **Testable**: Keep behavior small and deterministic so tests are easy to add when needed.

## Accessibility Requirements

All primitives in this folder MUST:

1. **Keyboard navigation**: Support `Tab`, `Enter`, `Space`, `Escape`, `Arrow keys` as appropriate for the control type.
2. **Screen reader**: Use semantic HTML and ARIA attributes (roles, labels, states).
3. **Focus management**: Provide visible focus indicators and restore focus on dismissal.
4. **Color contrast**: Meet WCAG AA standards (4.5:1 for text, 3:1 for UI components).

## API Conventions

### Props

- **Boolean props**: Use `disabled`, `readonly`, `required` (not `isDisabled`, `isReadonly`, etc.).
- **Handlers**: Use `on*` convention: `onclick`, `onchange`, `oninput`.
- **Size/Variant**: Use `size="sm|md|lg"`, `variant="primary|secondary|ghost"` where applicable.
- **State**: Expose state via props; avoid internal uncontrolled state unless absolutely necessary.

### Events

- Dispatch native DOM events when possible (e.g., `change`, `input`, `click`).
- For custom events, use a clear, action-oriented name (e.g., `select`, `dismiss`).

### Slots

- Use named slots sparingly; prefer `children` (default slot) for content.
- Document slot expectations in JSDoc.

## Testing

When adding non-trivial behavior to a primitive, prefer to include:

- **Unit tests**: Core logic (validation, state transitions).
- **Accessibility tests**: Keyboard navigation, focus management, ARIA roles/states.
- **Visual regression**: Snapshot tests for variants/sizes (if applicable).

See `documentation/agent-guidelines.md` for current project conventions. `documentation/agent-guidelines/testing-standards.md` is legacy reference material.

## Examples

### Button

```svelte
<Button variant="primary" size="md" disabled={false} onclick={handleClick}>Click me</Button>
```

### Checkbox

```svelte
<Checkbox checked={isChecked} onchange={handleChange} required>Accept terms</Checkbox>
```

### Tooltip

```svelte
<Tooltip text="Helpful hint" placement="top">
	<IconButton icon="info" aria-label="More information" />
</Tooltip>
```

## References

- [design-system.md](../../../../documentation/agent-guidelines/design-system.md) — Icons, forms, design tokens
- [accessibility-patterns.md](../../../../documentation/agent-guidelines/accessibility-patterns.md) — Keyboard, ARIA, focus management
- [agent-guidelines.md](../../../../documentation/agent-guidelines.md) — Project organization and module structure
- [testing-standards.md](../../../../documentation/agent-guidelines/testing-standards.md) — Legacy test standards (not Drive-specific)
