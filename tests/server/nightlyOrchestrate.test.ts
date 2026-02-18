import { describe, expect, it } from 'vitest';

import { decideWitnessRun } from '../../scripts/nightly/orchestrate';

describe('nightly orchestrator witness gating', () => {
	it('skips witness when upstream drills failed and override is off', () => {
		const decision = decideWitnessRun({
			witnessScriptExists: true,
			devServerOk: true,
			upstreamPassed: false,
			allowFailedUpstream: false
		});

		expect(decision.shouldRun).toBe(false);
		expect(decision.reason).toContain('upstream drills failed');
	});

	it('allows witness run when upstream failed but override is enabled', () => {
		const decision = decideWitnessRun({
			witnessScriptExists: true,
			devServerOk: true,
			upstreamPassed: false,
			allowFailedUpstream: true
		});

		expect(decision).toEqual({ shouldRun: true, reason: null });
	});
});
