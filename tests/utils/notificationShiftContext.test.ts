import { describe, expect, it } from 'vitest';

import {
	formatNotificationShiftContext,
	formatNotificationRouteStartTime
} from '../../src/lib/utils/notifications/shiftContext';

describe('formatNotificationShiftContext', () => {
	it('returns locale-aware date and time when both are present', () => {
		expect(formatNotificationShiftContext('2026-02-10', '09:00')).toBe('Tue, Feb 10, 9:00 AM');
	});

	it('returns date only when time is missing', () => {
		expect(formatNotificationShiftContext('2026-02-10', undefined)).toBe('Tue, Feb 10');
	});

	it('returns time only when date is missing', () => {
		expect(formatNotificationShiftContext(undefined, '14:30')).toBe('2:30 PM');
	});

	it('returns empty string when both values are missing', () => {
		expect(formatNotificationShiftContext(undefined, undefined)).toBe('');
	});

	it('formats in Korean when locale is ko', () => {
		const result = formatNotificationShiftContext('2026-02-10', '09:00', 'ko');
		expect(result).toContain('2월');
		expect(result).toContain('10');
		expect(result).toContain('오전');
	});

	it('formats date-only in Korean', () => {
		const result = formatNotificationShiftContext('2026-02-10', undefined, 'ko');
		expect(result).toContain('2월');
		expect(result).toContain('10');
	});
});

describe('formatNotificationRouteStartTime', () => {
	it('formats time in English by default', () => {
		expect(formatNotificationRouteStartTime('09:00')).toBe('9:00 AM');
		expect(formatNotificationRouteStartTime('14:30')).toBe('2:30 PM');
	});

	it('formats time in Korean', () => {
		expect(formatNotificationRouteStartTime('09:00', 'ko')).toContain('오전');
		expect(formatNotificationRouteStartTime('14:30', 'ko')).toContain('오후');
	});

	it('defaults to 9:00 for invalid input', () => {
		const result = formatNotificationRouteStartTime(null);
		expect(result).toBe('9:00 AM');
	});
});
