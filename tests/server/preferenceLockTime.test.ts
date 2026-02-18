import { describe, expect, it } from 'vitest';

import {
	getCurrentPreferenceLockDeadline,
	getNextPreferenceLockDeadline,
	isCurrentPreferenceCycleLocked
} from '../../src/lib/server/time/preferenceLock';

describe('preference lock deadline helpers', () => {
	it('uses the current-cycle Sunday boundary for lock checks', () => {
		const now = new Date('2026-02-10T12:00:00.000Z');

		expect(getCurrentPreferenceLockDeadline(now).toISOString()).toBe('2026-02-09T04:59:59.999Z');
		expect(getNextPreferenceLockDeadline(now).toISOString()).toBe('2026-02-16T04:59:59.999Z');
	});

	it('treats active-cycle lock timestamps as locked', () => {
		const now = new Date('2026-02-12T14:00:00.000Z');
		const activeCycleLock = new Date('2026-02-09T04:59:59.999Z');
		const priorCycleLock = new Date('2026-02-02T04:59:59.999Z');

		expect(isCurrentPreferenceCycleLocked(activeCycleLock, now)).toBe(true);
		expect(isCurrentPreferenceCycleLocked(priorCycleLock, now)).toBe(false);
		expect(isCurrentPreferenceCycleLocked(null, now)).toBe(false);
	});

	it('keeps Toronto Sunday lock deadlines stable across DST transitions', () => {
		const now = new Date('2026-03-09T12:00:00.000Z');

		expect(getCurrentPreferenceLockDeadline(now).toISOString()).toBe('2026-03-09T03:59:59.999Z');
		expect(getNextPreferenceLockDeadline(now).toISOString()).toBe('2026-03-16T03:59:59.999Z');
	});
});
