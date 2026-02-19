import { describe, expect, it } from 'vitest';

import {
	assertWitnessOverallPassed,
	computeWitnessOverall,
	UPSTREAM_CRON_FAILED
} from '../../scripts/nightly/witness-ui';

describe('witness UI overall verdict', () => {
	it('marks overall failure when cron verdict is false even when flows pass', () => {
		const overall = computeWitnessOverall({
			cronOverallPassed: false,
			failedFlowIds: []
		});

		expect(overall).toEqual({
			passed: false,
			failedFlows: [UPSTREAM_CRON_FAILED]
		});
	});

	it('keeps upstream sentinel and preserves flow failures', () => {
		const overall = computeWitnessOverall({
			cronOverallPassed: false,
			failedFlowIds: ['bidLoser']
		});

		expect(overall).toEqual({
			passed: false,
			failedFlows: [UPSTREAM_CRON_FAILED, 'bidLoser']
		});
	});

	it('treats missing or malformed cron verdict as upstream failure', () => {
		const missingVerdict = computeWitnessOverall({
			cronOverallPassed: undefined,
			failedFlowIds: []
		});
		const malformedVerdict = computeWitnessOverall({
			cronOverallPassed: 'PASS',
			failedFlowIds: []
		});

		expect(missingVerdict.failedFlows).toContain(UPSTREAM_CRON_FAILED);
		expect(missingVerdict.passed).toBe(false);
		expect(malformedVerdict.failedFlows).toContain(UPSTREAM_CRON_FAILED);
		expect(malformedVerdict.passed).toBe(false);
	});

	it('passes when cron and all witness flows pass', () => {
		const overall = computeWitnessOverall({
			cronOverallPassed: true,
			failedFlowIds: []
		});

		expect(overall).toEqual({ passed: true, failedFlows: [] });
	});

	it('throws on failed overall verdict to force non-zero process outcome', () => {
		expect(() =>
			assertWitnessOverallPassed({
				passed: false,
				failedFlows: [UPSTREAM_CRON_FAILED]
			})
		).toThrow('Witness UI verification failed');
	});
});
