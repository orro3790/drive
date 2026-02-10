import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

import { dispatchPolicy } from '$lib/config/dispatchPolicy';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const TORONTO_TIMEZONE = dispatchPolicy.timezone.toronto;

type DateParts = {
	year: number;
	month: number;
	day: number;
};

function parseDateOnly(dateString: string): DateParts {
	const match = DATE_ONLY_PATTERN.exec(dateString);
	if (!match) {
		throw new Error(`Invalid date-only value: ${dateString}`);
	}

	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3])
	};
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

export function toTorontoDateString(instant: Date): string {
	return formatInTimeZone(instant, TORONTO_TIMEZONE, 'yyyy-MM-dd');
}

export function getTorontoDateTimeInstant(
	dateString: string,
	options: {
		hours: number;
		minutes?: number;
		seconds?: number;
	}
): Date {
	parseDateOnly(dateString);

	const hours = options.hours;
	const minutes = options.minutes ?? 0;
	const seconds = options.seconds ?? 0;
	const localDateTime = `${dateString}T${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

	return fromZonedTime(localDateTime, TORONTO_TIMEZONE);
}

export function addDaysToDateString(dateString: string, days: number): string {
	const { year, month, day } = parseDateOnly(dateString);
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	utcDate.setUTCDate(utcDate.getUTCDate() + days);
	return utcDate.toISOString().slice(0, 10);
}

export function getDayOfWeekFromDateString(dateString: string): number {
	const { year, month, day } = parseDateOnly(dateString);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getTorontoWeekStartDateString(instant: Date): string {
	const torontoDate = toTorontoDateString(instant);
	const dayOfWeek = getDayOfWeekFromDateString(torontoDate);
	const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
	return addDaysToDateString(torontoDate, daysToMonday);
}
