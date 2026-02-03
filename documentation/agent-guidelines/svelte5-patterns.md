# Svelte 5 Patterns

Drive uses Svelte 5 runes by default.

## Defaults

- Use `$state` for local component state.
- Use `$derived` for computed values instead of ad-hoc recomputation.
- Use `$effect` for side effects tied to state.
- Avoid legacy `$:` reactivity unless required for interop.
- Shared state belongs in Smart Stores (see `smart-store-pattern.md`).

## Related

- `design-system.md`
- `navigation-patterns.md`
- `optimistic-ui-patterns.md`
- `accessibility-patterns.md`
