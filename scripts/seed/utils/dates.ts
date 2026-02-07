/**
 * Date Utilities for Seed Script
 *
 * Toronto timezone helpers for generating realistic date data.
 */

import { toZonedTime, format } from 'date-fns-tz';
import { addDays, addWeeks, startOfDay, subWeeks } from 'date-fns';
import { getSeedNow, randomInt } from './runtime';

export const TORONTO_TZ = 'America/Toronto';

/**
 * Get the start of a week (Monday) in Toronto timezone
 */
export function getWeekStart(date: Date): Date {
	const zonedDate = toZonedTime(date, TORONTO_TZ);
	const day = zonedDate.getDay();
	// Adjust to Monday (day 1). If Sunday (0), go back 6 days
	const diff = day === 0 ? -6 : 1 - day;
	const monday = addDays(zonedDate, diff);
	return startOfDay(monday);
}

/**
 * Convert a date to Toronto date string (YYYY-MM-DD)
 */
export function toTorontoDateString(date: Date): string {
	return format(toZonedTime(date, TORONTO_TZ), 'yyyy-MM-dd');
}

/**
 * Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday) in Toronto timezone
 */
export function getTorontoDayOfWeek(date: Date): number {
	return toZonedTime(date, TORONTO_TZ).getDay();
}

/**
 * Get today's date in Toronto timezone (start of day)
 */
export function getTorontoToday(): Date {
	return startOfDay(toZonedTime(getSeedNow(), TORONTO_TZ));
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

	// Past weeks (oldest first)
	for (let i = pastWeeks; i > 0; i--) {
		weeks.push(subWeeks(currentWeekStart, i));
	}

	// Current week
	weeks.push(currentWeekStart);

	// Future weeks
	for (let i = 1; i <= futureWeeks; i++) {
		weeks.push(addWeeks(currentWeekStart, i));
	}

	return weeks;
}

/**
 * Check if a date is in the past relative to today (Toronto time)
 */
export function isPastDate(dateString: string): boolean {
	const today = toTorontoDateString(getTorontoToday());
	return dateString < today;
}

/**
 * Check if a date is today (Toronto time)
 */
export function isToday(dateString: string): boolean {
	const today = toTorontoDateString(getTorontoToday());
	return dateString === today;
}

/**
 * Check if a date is in the future relative to today (Toronto time)
 */
export function isFutureDate(dateString: string): boolean {
	const today = toTorontoDateString(getTorontoToday());
	return dateString > today;
}

/**
 * Generate a random time on a specific date for timestamps.
 * Useful for creating realistic startedAt, completedAt times.
 */
export function randomTimeOnDate(dateString: string, startHour = 6, endHour = 20): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	const hour = randomInt(startHour, endHour);
	const minute = randomInt(0, 60);
	return new Date(year, month - 1, day, hour, minute);
}
