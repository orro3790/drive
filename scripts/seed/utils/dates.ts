/**
 * Date Utilities for Seed Script
 *
 * All seed dates use UTC Dates where the UTC date components match Toronto's
 * local date. This avoids the double-timezone-conversion bug where
 * toZonedTime() was called on already-zoned dates.
 *
 * The single timezone conversion happens in getTorontoTodayString(), which
 * determines "what date is it right now in Toronto?" Everything else works
 * with plain UTC arithmetic.
 */

import { toZonedTime, format } from 'date-fns-tz';
import { addDays, addWeeks, subWeeks } from 'date-fns';
import { getSeedNow, randomInt } from './runtime';

export const TORONTO_TZ = 'America/Toronto';

/**
 * Get today's date string in Toronto timezone (YYYY-MM-DD).
 * This is the ONLY function that performs timezone conversion.
 */
export function getTorontoTodayString(): string {
	return format(toZonedTime(getSeedNow(), TORONTO_TZ), 'yyyy-MM-dd');
}

/**
 * Get today as a UTC Date whose date components match Toronto's current date.
 * Uses noon UTC to avoid DST edge cases with addDays/subWeeks arithmetic.
 */
export function getTorontoToday(): Date {
	const [y, m, d] = getTorontoTodayString().split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Convert a seed Date to YYYY-MM-DD string.
 * Reads the UTC date components directly (no timezone conversion).
 */
export function toTorontoDateString(date: Date): string {
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Get day of week from UTC date components (0=Sunday, 1=Monday, ..., 6=Saturday)
 */
export function getTorontoDayOfWeek(date: Date): number {
	return date.getUTCDay();
}

/**
 * Get the start of a week (Monday) from a seed Date.
 */
export function getWeekStart(date: Date): Date {
	const day = date.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	const monday = addDays(date, diff);
	return new Date(
		Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 12, 0, 0)
	);
}

/**
 * Generate an array of dates for a given week range.
 * Returns objects with both Date and string representations.
 */
export function getWeekDates(weekStart: Date): Array<{
	date: Date;
	dateString: string;
	dayOfWeek: number;
}> {
	const dates: Array<{ date: Date; dateString: string; dayOfWeek: number }> = [];
	for (let i = 0; i < 7; i++) {
		const date = addDays(weekStart, i);
		dates.push({
			date,
			dateString: toTorontoDateString(date),
			dayOfWeek: getTorontoDayOfWeek(date)
		});
	}
	return dates;
}

/**
 * Get an array of week starts for past and future weeks relative to current week.
 */
export function getWeekRange(pastWeeks: number, futureWeeks: number): Date[] {
	const currentWeekStart = getWeekStart(getTorontoToday());
	const weeks: Date[] = [];

	for (let i = pastWeeks; i > 0; i--) {
		weeks.push(subWeeks(currentWeekStart, i));
	}

	weeks.push(currentWeekStart);

	for (let i = 1; i <= futureWeeks; i++) {
		weeks.push(addWeeks(currentWeekStart, i));
	}

	return weeks;
}

/**
 * Check if a date is in the past relative to today (Toronto time)
 */
export function isPastDate(dateString: string): boolean {
	return dateString < getTorontoTodayString();
}

/**
 * Check if a date is today (Toronto time)
 */
export function isToday(dateString: string): boolean {
	return dateString === getTorontoTodayString();
}

/**
 * Check if a date is in the future relative to today (Toronto time)
 */
export function isFutureDate(dateString: string): boolean {
	return dateString > getTorontoTodayString();
}

/**
 * Generate a random time on a specific date for timestamps.
 * Creates a UTC Date at the given hour/minute on the date.
 */
export function randomTimeOnDate(dateString: string, startHour = 6, endHour = 20): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	const hour = randomInt(startHour, endHour);
	const minute = randomInt(0, 60);
	return new Date(Date.UTC(year, month - 1, day, hour, minute));
}
