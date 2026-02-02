/**
 * @file src/lib/schemas/ui/radio.ts
 * @description Types for radio group components.
 */

/** A single option in a radio group */
export interface RadioOption {
	/** The value submitted when this option is selected */
	value: string;
	/** Display label for the option */
	label: string;
	/** Optional description text below the label */
	description?: string;
}
