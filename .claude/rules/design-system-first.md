# Design System First Rule

Before building or styling UI:

1. Search `src/lib/components` and `src/lib/components/primitives` for existing components.
2. Prefer those components over raw HTML elements whenever an equivalent exists.
3. Use `InlineEditor` for form inputs, `Button`/`Checkbox` for controls, and `NoticeBanner` for in-form messaging.
4. Use the design tokens in `src/app.css` for colors, spacing, typography, radii, and shadows.
5. Do not import new fonts or hardcode colors; extend tokens only if a gap is proven.
6. Auth UI should match the Snapgrade auth aesthetic (see `C:/Users/matto/projects/Snapgrade/src/lib/modules/auth/components/AuthLayout.svelte` and `LoginForm.svelte`).

If a new component is truly required, explain why no existing primitive fits and keep it token-driven.
