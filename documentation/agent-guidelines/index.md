# Drive Agent Guidelines Index (Concise Catalogue)

Purpose: help agents find the minimal, most relevant docs quickly. Start with the Drive-specific guide, then pull only the one or two deep-dive docs you need.

Start here:

- `documentation/agent-guidelines.md` (Drive-specific conventions)
- `documentation/agent-guidelines/system-overview.md` (what we're building)

Frontend & UX:

- `documentation/agent-guidelines/design-system.md` (tokens, primitives, page scaffolding)
- `documentation/agent-guidelines/svelte5-patterns.md` (Svelte 5 runes defaults)
- `documentation/agent-guidelines/tanstack-table-pattern.md` (TanStack Table + custom Svelte 5 adapter)
- `documentation/agent-guidelines/navigation-patterns.md` (URL state, breadcrumbs, `pageHeaderStore`)
- `documentation/agent-guidelines/accessibility-patterns.md` (keyboard, ARIA, focus management)
- `documentation/agent-guidelines/i18n-paraglide.md` (Paraglide; never hardcode user-facing strings)

State & Data Flow:

- `documentation/agent-guidelines/smart-store-pattern.md` (store shape, responsibilities, async patterns)
- `documentation/agent-guidelines/optimistic-ui-patterns.md` (instant UI + safe reconciliation)
- `documentation/agent-guidelines/error-handling-protocol.md` (toasts vs inline errors)

Backend:

- `documentation/agent-guidelines/api-endpoint-patterns.md` (SvelteKit `+server.ts` conventions)
- `documentation/agent-guidelines/authentication-patterns.md` (Better Auth locals, role checks)
- `documentation/agent-guidelines/schema-type-patterns.md` (Zod at boundaries; when local TS types are OK)
- `documentation/agent-guidelines/logging-strategy.md` (Pino + Axiom; no secrets/PII)

Process:

- `documentation/agent-guidelines/code-review-standards.md`
- `documentation/agent-guidelines/documentation-standards.md`
- `documentation/agent-guidelines/utils-catalog.md` (re-use helpers before adding new)

Legacy (copied from a previous project; not yet applicable to Drive):

- `documentation/agent-guidelines/search-patterns.md` (Typesense)
- `documentation/agent-guidelines/firestore-timestamp-patterns.md` (Firestore)
- `documentation/agent-guidelines/signed-urls-management.md` (GCS/Firestore)
- `documentation/agent-guidelines/trial-system-and-gating.md` (trial/premium gating)
- `documentation/agent-guidelines/mutation-strategies.md` (Firestore-first constraints)
- `documentation/agent-guidelines/testing-standards.md` (Firestore/GCS E2E assumptions)

Tip: If you still aren't sure what to open, read `documentation/agent-guidelines.md`, then pull exactly one deep-dive doc from this index.
