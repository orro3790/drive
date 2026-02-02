/**
 * @file src/lib/utils/date/firestore.ts
 * @description Date parsing utilities for Firestore-style date strings.
 */

/**
 * Parse a local YYYY-MM-DD date string into a Date object.
 * Interprets the date as local time (midnight local).
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object set to midnight local time, or null if invalid
 */
export function parseLocalYMD(dateString: string | null | undefined): Date | null {
	if (!dateString) return null;

	// Match YYYY-MM-DD format
	const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;

	const year = parseInt(match[1], 10);
	const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
	const day = parseInt(match[3], 10);

	const date = new Date(year, month, day);

	// Validate the date components match (handles invalid dates like Feb 30)
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
		return null;
	}

	return date;
}
