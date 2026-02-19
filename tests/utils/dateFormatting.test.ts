import { describe, expect, it } from 'vitest';

import { formatAssignmentDateTime, formatRouteStartTime } from '$lib/utils/date/formatting';

describe('date formatting helpers', () => {
	it('formats route start time with minutes in 12-hour labels', () => {
		expect(formatRouteStartTime('09:00')).toBe('9:00 AM');
		expect(formatRouteStartTime('09:30')).toBe('9:30 AM');
		expect(formatRouteStartTime('13:05')).toBe('1:05 PM');
	});

	it('falls back to default route start time for malformed values', () => {
		expect(formatRouteStartTime(undefined)).toBe('9:00 AM');
		expect(formatRouteStartTime('invalid')).toBe('9:00 AM');
	});

	it('formats assignment date-time with route start time label', () => {
		expect(formatAssignmentDateTime('2026-02-10', '09:00')).toBe('Tue, Feb 10 · 9:00 AM');
	});
});
