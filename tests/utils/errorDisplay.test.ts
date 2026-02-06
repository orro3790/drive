import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_ERRORS, createErrorDisplay } from '$lib/utils/errorDisplay';

describe('createErrorDisplay', () => {
	it('returns a clean state when there are no errors', () => {
		const display = createErrorDisplay();

		expect(display.hasErrors).toBe(false);
		expect(display.displayErrors).toEqual([]);
		expect(display.showMoreCount).toBe(0);
		expect(display.ariaInvalid).toBeUndefined();
	});

	it('limits inline errors to the default max', () => {
		const errors = ['alpha', 'beta', 'gamma', 'delta'];
		const display = createErrorDisplay(errors);

		expect(display.hasErrors).toBe(true);
		expect(display.displayErrors).toEqual(errors.slice(0, DEFAULT_MAX_ERRORS));
		expect(display.showMoreCount).toBe(1);
		expect(display.ariaInvalid).toBe('true');
	});

	it('uses a custom maxErrors override', () => {
		const errors = ['one', 'two', 'three'];
		const display = createErrorDisplay(errors, 2);

		expect(display.displayErrors).toEqual(['one', 'two']);
		expect(display.showMoreCount).toBe(1);
	});
});
