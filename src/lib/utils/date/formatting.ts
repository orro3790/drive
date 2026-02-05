/**
 * @file src/lib/utils/date/formatting.ts
 * @description Date formatting utilities for UI display.
 */

import {
	differenceInHours,
	differenceInMinutes,
	format,
	isToday,
	isYesterday,
	startOfWeek
} from 'date-fns';

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

/**
 * Format a date for UI display (relative time).
 * @param date - Date object or ISO string
 * @returns Relative time string (e.g., "2m ago", "Yesterday")
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
	if (!date) return '';

	const d = typeof date === 'string' ? new Date(date) : date;

	if (isNaN(d.getTime())) return '';

	const now = new Date();
	const minutes = differenceInMinutes(now, d);

	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;

	const hours = differenceInHours(now, d);
	if (hours < 24) return `${hours}h ago`;
	if (isYesterday(d)) return 'Yesterday';

	return format(d, 'MMM d');
}

/**
 * Get a time group key for a given date.
 * @param date - Date object or ISO string
 * @returns Group key for UI sections
 */
export function getTimeGroup(
	date: Date | string | null | undefined
): 'today' | 'yesterday' | 'this_week' | 'earlier' {
	if (!date) return 'earlier';

	const d = typeof date === 'string' ? new Date(date) : date;

	if (isNaN(d.getTime())) return 'earlier';
	if (isToday(d)) return 'today';
	if (isYesterday(d)) return 'yesterday';

	const startOfThisWeek = startOfWeek(new Date(), { weekStartsOn: 0 });
	if (d >= startOfThisWeek) return 'this_week';

	return 'earlier';
}
