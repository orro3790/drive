import { describe, expect, it } from 'vitest';

import {
	evaluateNightlyAlertDecision,
	parseRequiredArtifactPaths,
	parseRunAttempt
} from '../../scripts/nightly/operational-alert';

describe('nightly operational alert decision', () => {
	it('does not alert when job succeeds and required artifacts exist', () => {
		const decision = evaluateNightlyAlertDecision({
			jobStatus: 'success',
			requiredArtifactPaths: ['logs/ci/integration-full/runtime.json'],
			artifactExists: () => true,
			artifactDate: '2026-02-19',
			runId: '100',
			runAttempt: 1
		});

		expect(decision.shouldAlert).toBe(false);
		expect(decision.shouldDispatch).toBe(false);
		expect(decision.reasons).toEqual([]);
	});

	it('alerts and dispatches on first-attempt failures', () => {
		const decision = evaluateNightlyAlertDecision({
			jobStatus: 'failure',
			requiredArtifactPaths: [
				'logs/ci/integration-full/runtime.json',
				'logs/ci/integration-full/vitest.log'
			],
			artifactExists: (artifactPath) => artifactPath.endsWith('runtime.json'),
			artifactDate: '2026-02-19',
			runId: '101',
			runAttempt: 1
		});

		expect(decision.shouldAlert).toBe(true);
		expect(decision.shouldDispatch).toBe(true);
		expect(decision.duplicateSuppressed).toBe(false);
		expect(decision.missingArtifacts).toEqual(['logs/ci/integration-full/vitest.log']);
		expect(decision.reasons).toContain('job.status=failure');
	});

	it('suppresses duplicate dispatches on rerun attempts', () => {
		const decision = evaluateNightlyAlertDecision({
			jobStatus: 'failure',
			requiredArtifactPaths: ['logs/ci/integration-full/runtime.json'],
			artifactExists: () => true,
			artifactDate: '2026-02-19',
			runId: '102',
			runAttempt: 2
		});

		expect(decision.shouldAlert).toBe(true);
		expect(decision.shouldDispatch).toBe(false);
		expect(decision.duplicateSuppressed).toBe(true);
		expect(decision.dedupeKey).toBe('2026-02-19:102');
	});
});

describe('nightly operational alert parsing helpers', () => {
	it('parses required artifact list and falls back to defaults', () => {
		expect(parseRequiredArtifactPaths('a.json, b.log')).toEqual(['a.json', 'b.log']);
		expect(parseRequiredArtifactPaths('  ')).toEqual([
			'logs/ci/integration-full/runtime.json',
			'logs/ci/integration-full/vitest.log'
		]);
	});

	it('parses run attempt safely', () => {
		expect(parseRunAttempt('3')).toBe(3);
		expect(parseRunAttempt('0')).toBe(1);
		expect(parseRunAttempt(undefined)).toBe(1);
		expect(parseRunAttempt('NaN')).toBe(1);
	});
});
