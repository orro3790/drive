import { afterEach, describe, expect, it } from 'vitest';

import { mockBoundaryRejected, mockBoundaryResolved } from './serviceMocks';
import { advanceTimeByMs, freezeTime, resetTime, withFrozenTime } from './time';

afterEach(() => {
	resetTime();
});

describe('time harness', () => {
	it('freezes and advances clock deterministically', () => {
		freezeTime('2026-02-01T00:00:00.000Z');
		expect(new Date().toISOString()).toBe('2026-02-01T00:00:00.000Z');

		advanceTimeByMs(90_000);
		expect(new Date().toISOString()).toBe('2026-02-01T00:01:30.000Z');
	});

	it('executes callbacks with frozen time and restores timers', async () => {
		await withFrozenTime('2026-02-01T12:34:56.000Z', async () => {
			expect(new Date().toISOString()).toBe('2026-02-01T12:34:56.000Z');
		});

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(new Date().toISOString()).not.toBe('2026-02-01T12:34:56.000Z');
	});
});

describe('service boundary mocks', () => {
	it('creates resolved async boundary mocks', async () => {
		const boundary = mockBoundaryResolved<[string], number>(42);

		await expect(boundary('route-1')).resolves.toBe(42);
		expect(boundary).toHaveBeenCalledWith('route-1');
	});

	it('creates rejected async boundary mocks', async () => {
		const boundary = mockBoundaryRejected<[string]>(new Error('boom'));

		await expect(boundary('route-1')).rejects.toThrow('boom');
		expect(boundary).toHaveBeenCalledWith('route-1');
	});
});
