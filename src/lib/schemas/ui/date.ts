/**
 * @file src/lib/schemas/ui/date.ts
 * @description Types for date picker components.
 */

/** Date picker selection mode */
export type DatePickerMode = 'single' | 'range';

/** A date range with start and end dates as ISO strings (YYYY-MM-DD) */
export interface DateRange {
	/** Start date in ISO format */
	start: string;
	/** End date in ISO format */
	end: string;
}
