/**
 * Shared error display utility for form components
 * Provides consistent error handling logic across all form inputs
 */

/** Default maximum number of errors to display inline */
export const DEFAULT_MAX_ERRORS = 3;

/**
 * Creates standardized error display state for form components
 * @param errors - Array of error messages from validation
 * @param maxErrors - Maximum number of errors to display (default: 3)
 * @returns Object with computed error display properties
 */
export function createErrorDisplay(errors: string[] = [], maxErrors: number = DEFAULT_MAX_ERRORS) {
	const hasErrors = errors.length > 0;
	const displayErrors = errors.slice(0, maxErrors);
	const showMoreCount = Math.max(0, errors.length - maxErrors);

	return {
		hasErrors,
		displayErrors,
		showMoreCount,
		/** For aria-invalid attribute */
		ariaInvalid: hasErrors ? ('true' as const) : undefined
	} as const;
}
