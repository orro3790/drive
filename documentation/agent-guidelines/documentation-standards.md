# Documentation Standards Guide

This document provides documentation standards for the Drive codebase.

## 1. JSDoc Requirements

Guideline: exported functions, public store APIs, and non-trivial helpers should have JSDoc following these standards.

### 1.1 Function Documentation

```typescript
/**
 * Generate a weekly schedule starting at a given week start date.
 * @param targetWeekStart - Week start date (Monday) in Toronto/Eastern
 * @returns Counts of created assignments and unfilled slots
 * @throws {Error} When scheduling inputs are invalid or generation fails
 */
async function generateWeekSchedule(
	targetWeekStart: Date
): Promise<{ created: number; unfilled: number }> {
	// Implementation...
}
```

### 1.2 Class Documentation

```typescript
/**
 * Manages scheduling and related domain operations.
 */
class SchedulingService {
	/**
	 * Create a new service instance.
	 * @param userId - Authenticated user id
	 */
	constructor(userId: string) {
		// Implementation...
	}
}
```

### 1.3 Interface/Type Documentation

```typescript
/**
 * Local-only example: component-internal view model (not exported)
 * Use Zod schemas for any domain/shared contracts. See `documentation/agent-guidelines/schema-type-patterns.md`.
 */
interface WarehouseFormState {
	/** Field values */
	name: string;
	address: string;
	/** Field-level validation errors */
	errors: Record<string, string[]>;
}
```

## 2. Documentation Best Practices

### 2.1 Parameter Documentation

- Always document all parameters with clear descriptions
- Include type information when not obvious from TypeScript
- Specify optional parameters and default values
- Document parameter constraints or validation rules

### 2.2 Return Value Documentation

- Always document what the function returns
- Include information about Promise resolution for async functions
- Specify possible return states or values

### 2.3 Error Documentation

- Document all possible thrown errors using `@throws`
- Include error conditions and recovery strategies
- Specify custom error types when applicable

### 2.4 Examples for Complex Functions

- Include `@example` tags for complex or non-obvious usage
- Show realistic use cases
- Include error handling examples when relevant

````typescript
/**
 * Require an authenticated session.
 * @param headers - Request headers used to resolve the session
 * @returns The authenticated session (or throws)
 * @throws {Error} When the session is missing or invalid
 * @example
 * ```typescript
 * try {
 *     const session = await auth.api.getSession({ headers: request.headers });
 *     // Process authenticated request
 * } catch (error) {
 *     // Handle other errors...
 * }
 * ```
 */
````

## 3. File-Level Documentation

### 3.1 Header Comments

Each file should include a header comment explaining its purpose:

```typescript
/**
 * @fileoverview Warehouse API handlers
 * Handles requests related to warehouse CRUD.
 *
 * @author Drive Team
 * @since 2024-01-15
 */
```

### 3.2 Module Documentation

For complex modules, include overview documentation:

```typescript
/**
 * @module SchedulingService
 * @description Handles scheduling generation and related operations.
 *
 * Key responsibilities:
 * - Preference lock rules (Toronto/Eastern)
 * - Assignment generation and reconciliation
 * - Guardrails (weekly caps, flagged drivers)
 */
```

## 4. README Requirements

- Maintain clear README with setup instructions
- Include environment variable documentation
- Provide development workflow guidance
- Document API endpoints and their usage
- Include troubleshooting section for common issues

## 5. Architecture Documentation

- Reference architectural documentation in code comments when relevant
- Link to specific architecture guides for complex systems
- Maintain consistency between code comments and architecture docs
- Update documentation when making architectural changes
