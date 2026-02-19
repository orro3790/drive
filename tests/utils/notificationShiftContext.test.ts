import { describe, expect, it } from 'vitest';

import { formatNotificationShiftContext } from '../../src/lib/utils/notifications/shiftContext';

describe('formatNotificationShiftContext', () => {
	it('returns date and time when both are present', () => {
		expect(formatNotificationShiftContext('2026-02-10', '09:00')).toBe('Tue, Feb 10 at 9:00 AM');
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
});
