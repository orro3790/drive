/**
 * @file src/lib/utils/date/formatting.ts
 * @description Date formatting utilities for UI display.
 */

/**
 * Format a date for UI display (date only).
 * @param date - Date object or ISO string
 * @returns Formatted date string (e.g., "Jan 15, 2026")
 */
export function formatUiDate(date: Date | string | null | undefined): string {
	if (!date) return '';

	const d = typeof date === 'string' ? new Date(date) : date;

	if (isNaN(d.getTime())) return '';

	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/**
 * Format a date for UI display (date and time).
 * @param date - Date object or ISO string
 * @returns Formatted date+time string (e.g., "Jan 15, 2026, 3:30 PM")
 */
export function formatUiDateTime(date: Date | string | null | undefined): string {
	if (!date) return '';

	const d = typeof date === 'string' ? new Date(date) : date;

	if (isNaN(d.getTime())) return '';

	return d.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
}
