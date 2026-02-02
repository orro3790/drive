# UI Primitives

This directory contains low-level, reusable UI components ("primitives") with strict accessibility and API guarantees.

## Purpose

Primitives are:

- **Foundational**: Used as building blocks by higher-level composites in `lib/components/`.
- **Consistent**: Follow uniform prop/event naming and accessibility patterns.
- **Tested**: Each primitive includes accessibility tests (keyboard, screen-reader, ARIA).

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

Each primitive should include:

- **Unit tests**: Core logic (validation, state transitions).
- **Accessibility tests**: Keyboard navigation, focus management, ARIA roles/states.
- **Visual regression**: Snapshot tests for variants/sizes (if applicable).

See `documentation/agent-guidelines/testing-standards.md` for full standards.

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

- [client-ui-conventions.mdc](../../../.cursor/rules/client-ui-conventions.mdc) — Icons, forms, design tokens
- [testing-standards.md](../../../documentation/agent-guidelines/testing-standards.md) — Test structure and coverage
- [project-organization.md](../../../documentation/agent-guidelines/project-organization.md) — Module structure
