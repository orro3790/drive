# Code Review Standards

This document defines how we review code in Drive.

## 1. Core Principles

- **Readability**: Clear, concise code with meaningful names.
- **SRP/DRY/Modularity**: Single responsibility, avoid duplication, and maintain clear component boundaries.
- **Idiomatic Usage**: Follow official patterns for Svelte 5/SvelteKit, and Zod; avoid legacy/anti‑patterns.
- **Technical Debt**: Remove bloat and redundancies as you touch code.
- **Error Handling**: Consistent, actionable errors; no swallowed exceptions.
- **Security & Performance**: No new vulnerabilities; no unexpected regressions.
- **Boundary Validation**: Validate API boundaries with Zod (`safeParse`). Avoid type assertions at API edges.

## 2. Review Checklist

### 2.1 Functional Correctness

- No regressions; existing behaviors preserved
- Edge cases identified and handled

### 2.2 Maintainability and Design

- Code is easy to read and navigate
- Adheres to Single Responsibility Principle (SRP)
- Eliminates duplication (DRY)
- Eliminates any unused variables
- Decoupled, modular components with clear boundaries
- Uses idiomatic project/library patterns
- Removes legacy code and bloat where feasible
- Consistent, appropriate error handling

### 2.3 Compliance and Security

- Strict adherence to relevant agent guidelines
- No new security flaws; auth and data access patterns respected
- No unexpected performance degradation or resource spikes

### 2.4 Architecture & Patterns Alignment

- Smart Store pattern is followed for feature‑domain stores; see `documentation/agent-guidelines/smart-store-pattern.md`
- Schema‑first types: no ad‑hoc TypeScript interfaces; types are inferred from Zod schemas in `src/lib/schemas/`
- Svelte 5 Runes patterns and accessibility requirements are followed
- Logging follows structured, contextual logging strategy (no PII/secrets)
- Optimistic UI patterns are used for mutations where appropriate
- Avoid client-side direct DB subscriptions/population patterns; treat server endpoints as the source of truth.
- Authentication uses Better Auth locals: `locals.user`, `locals.session`, `locals.userId` (see `documentation/agent-guidelines/authentication-patterns.md`).
- Component reuse: prefer `src/lib/components/primitives/` and existing shared components in `src/lib/components/` (see `documentation/agent-guidelines/design-system.md`).

### 2.5 Testing & CI

...

### 2.6 i18n & Localization (Paraglide)

- **Tokenization**: All user-facing strings in frontend components (labels, placeholders, aria-labels) and backend APIs (error messages, success toasts) MUST be tokenized using Paraglide.
- **Bi-lingual Implementation**: Every new token must be implemented in both `messages/en.json` and `messages/zh.json`.
- **No Hardcoded Strings**: Verify that no hardcoded user-facing text is returned from server actions, API routes, or rendered in Svelte components.
- **Dynamic Content**: Ensure tokens with variables (e.g., `{count}`) are correctly handled in both languages.

### 2.7 Timestamp Handling (Postgres/Drizzle)

- Prefer DB-authored timestamps (`createdAt`, `updatedAt`) for persisted ordering.
- Optimistic UI may use a local `new Date()` for immediate ordering, but should reconcile once the server returns the canonical record.
- If parsing user-entered date-only strings, use safe local parsing (see `src/lib/utils/date/firestore.ts:parseLocalYMD`).

## 4. Review Process (minimal)

- Keep PRs small and focused; include context and explicit testing notes with links to `tests/` files
- Ensure build/lint/tests are green; include or update tests for any logic change; reviewers should block merges if tests are missing for changed logic
- Include a brief coverage note (overall and for touched files) and call out any justified decreases
- Verify accessibility and keyboard navigation for interactive UI
- Prefer concrete suggestions and links to guidelines when requesting changes

## 5. Notes for Agent Reviews

- Keep feedback concrete: cite files and the relevant guideline doc.
- Prefer small, focused PRs with explicit verification steps.
