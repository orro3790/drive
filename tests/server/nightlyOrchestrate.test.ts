import { describe, expect, it } from 'vitest';

import { buildSkippedWitnessResult, decideWitnessRun } from '../../scripts/nightly/orchestrate';

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

	it('skips witness when witness script is missing', () => {
		const decision = decideWitnessRun({
			witnessScriptExists: false,
			devServerOk: true,
			upstreamPassed: true,
			allowFailedUpstream: false
		});

		expect(decision.shouldRun).toBe(false);
		expect(decision.reason).toContain('script missing');
	});

	it('skips witness when dev server is unreachable', () => {
		const decision = decideWitnessRun({
			witnessScriptExists: true,
			devServerOk: false,
			upstreamPassed: true,
			allowFailedUpstream: false
		});

		expect(decision.shouldRun).toBe(false);
		expect(decision.reason).toContain('dev server not detected');
	});

	it('treats skipped witness as non-pass with explicit artifact diagnostics', () => {
		const result = buildSkippedWitnessResult({
			reason: 'dev server not detected',
			expectedReportPath: 'logs/nightly/2026-02-19/witness-ui-report.json'
		});

		expect(result.passed).toBe(false);
		expect(result.skipped).toBe(true);
		expect(result.status).toBe('skipped');
		expect(result.reportPath).toBe('logs/nightly/2026-02-19/witness-ui-report.json');
		expect(result.reconciliationError).toContain('Missing required witness artifact');
		expect(result.reconciliationError).toContain('dev server not detected');
	});
});
