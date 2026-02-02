---
name: component-audit
description: Component auditing for minimalism, documentation, utility deduplication, and UX gaps. Use when asked to audit, review, or clean up a Svelte component.
---

# Component Audit

Thorough audit to minimize logic, document properly, eliminate duplicate utilities, and identify UX gaps.

## Objectives

- **Minimalism**: Remove unreachable UI, duplicated logic, unused imports/styles, redundant state, unnecessary DOM nesting
- **Documentation**: Ensure up-to-date and accurate `@component` JSDoc
- **No Utility Duplication**: Ensure no locally-defined functions re-implement utilities or helpers available elsewhere in the codebase (e.g., `src/lib/utils/`)
- **i18n (Paraglide)**: Replace all hardcoded strings (UI labels, placeholders, aria-labels, error messages) with tokenized Paraglide messages implemented in both `messages/en.json` and `messages/zh.json`.
- **UX Gaps**: Identify missing functionality or improvements in user flows. Assess cognitive load, design polish, and whether the UI is appropriately minimal.

## Scope

- Primary: The specified component file
- Inspect parents to confirm reachability and deduplicate logic
- Analyze the codebase directory structure (e.g., `src/lib/utils/`, existing shared helpers) to prevent function duplication
- Check existing primitives and components before creating bespoke UI elements

## Audit Checklist

1. **Reachability**: Map where it's rendered; remove branches that can't render
2. **SRP**: Logic handled by parent/store should be removed from component
3. **State**: Add guards where inference fails; avoid non-null assertions
4. **Lean DOM**: Minimize nesting; use semantic elements; prefer tokens over magic numbers
5. **Styles**: Remove unused CSS; keep selectors scoped
6. **Accessibility**: Preserve ARIA, focus order, and semantics
7. **No Utility Duplication**: Review all functions defined within the component; if any implement functionality that matches or overlaps with existing helpers/utilities, replace with the shared utility. Reference the project structure (`src/lib/utils/`, etc.) as needed for this check.
8. **Primitive & Component Reuse**: Before creating bespoke UI, check if existing components can be used:
   - **Primitives** (`src/lib/components/primitives/`): Button, Chip, IconButton, Avatar, Modal, Icon, InlineEditor, NoticeBanner
   - **Form inputs** (`src/lib/components/`): Select, DatePicker, TimePicker, ColorPicker
   - **Data display** (`src/lib/components/data-table/`): DataTable, DataTableEmpty, column helpers
   - If a bespoke `<input>`, `<select>`, or `<button>` is used, verify no existing primitive fits the need
   - Bespoke is acceptable for specialized one-offs, performance-critical rendering, or domain-specific visualization—document the rationale
9. **UX & Design Review**: Think like a user, not just a code reviewer. Verify the component actually _feels_ right to use—consider friction, visual hierarchy, and whether the chosen UI pattern fits the context. Avoid common AI-generated design anti-patterns (visual clutter, gratuitous decoration, heavy borders where spacing would suffice). Ensure the design is on-brand and consistent with the existing aesthetic.
10. **i18n Compliance**: Verify no hardcoded strings remain; all user-facing text must use Paraglide tokens with corresponding entries in English and Chinese message files.

## Principles

- Core principles: SRP, DRY, modularity
- Architecture: Don't duplicate store or utility logic in leaf components

## Deliverables

- **Findings**: Issues identified with severity and location
- **Recommendations**: Specific fixes with rationale
- **Citations**: Rules/guidelines applied

Note: Browser validation happens in `/verify` phase, not here. This audit is code-focused.
