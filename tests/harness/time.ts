import { vi } from 'vitest';

export type TimeInput = Date | string | number;

function toDate(value: TimeInput): Date {
	const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid time value: ${String(value)}`);
	}

	return date;
}

export function freezeTime(value: TimeInput): Date {
	const now = toDate(value);
	vi.useFakeTimers();
	vi.setSystemTime(now);
	return now;
}

export function advanceTimeByMs(milliseconds: number): Date {
	vi.advanceTimersByTime(milliseconds);
	return new Date(Date.now());
}

export function resetTime(): void {
	vi.useRealTimers();
}

export async function withFrozenTime<T>(
	value: TimeInput,
	run: (frozenNow: Date) => Promise<T> | T
): Promise<T> {
	const frozenNow = freezeTime(value);

	try {
		return await run(frozenNow);
	} finally {
		resetTime();
	}
}
