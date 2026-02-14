import { vi } from 'vitest';

export type TimeInput = Date | string | number;

function toDate(value: TimeInput): Date {
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid time value: ${String(value)}`);
	}

	return date;
}

/**
 * Integration tests talk to a real database. We only fake `Date` so that IO timers
 * used by drivers (pg, undici, etc.) keep working.
 */
export function freezeTime(value: TimeInput): Date {
	const now = toDate(value);
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(now);
	return now;
}

export function resetTime(): void {
	vi.useRealTimers();
}
