import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_REQUIRED_ARTIFACTS = [
	'logs/ci/integration-full/runtime.json',
	'logs/ci/integration-full/vitest.log'
];

export type NightlyAlertDecision = {
	shouldAlert: boolean;
	shouldDispatch: boolean;
	duplicateSuppressed: boolean;
	dedupeKey: string;
	reasons: string[];
	missingArtifacts: string[];
};

type EvaluateNightlyAlertDecisionParams = {
	jobStatus: string;
	requiredArtifactPaths: string[];
	artifactExists: (artifactPath: string) => boolean;
	artifactDate: string;
	runId: string;
	runAttempt: number;
};

export function parseRequiredArtifactPaths(raw: string | undefined): string[] {
	if (!raw) return [...DEFAULT_REQUIRED_ARTIFACTS];

	const values = raw
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	return values.length > 0 ? values : [...DEFAULT_REQUIRED_ARTIFACTS];
}

export function parseRunAttempt(raw: string | undefined): number {
	const parsed = Number.parseInt(raw ?? '1', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function evaluateNightlyAlertDecision(
	params: EvaluateNightlyAlertDecisionParams
): NightlyAlertDecision {
	const normalizedStatus = params.jobStatus.trim().toLowerCase();
	const missingArtifacts = params.requiredArtifactPaths.filter(
		(artifactPath) => !params.artifactExists(artifactPath)
	);
	const reasons: string[] = [];

	if (normalizedStatus !== 'success') {
		reasons.push(`job.status=${normalizedStatus || 'unknown'}`);
	}

	if (missingArtifacts.length > 0) {
		reasons.push(`missing required artifacts: ${missingArtifacts.join(', ')}`);
	}

	const shouldAlert = reasons.length > 0;
	const dedupeKey = `${params.artifactDate}:${params.runId}`;
	const duplicateSuppressed = shouldAlert && params.runAttempt > 1;

	return {
		shouldAlert,
		shouldDispatch: shouldAlert && !duplicateSuppressed,
		duplicateSuppressed,
		dedupeKey,
		reasons,
		missingArtifacts
	};
}

function buildAlertPayload(args: {
	decision: NightlyAlertDecision;
	repository: string;
	workflow: string;
	runId: string;
	runAttempt: number;
	sha: string;
	runUrl: string;
	artifactDate: string;
	owner: string;
	escalationPath: string;
}): Record<string, unknown> {
	const summary = [
		`Nightly integration alert (${args.workflow})`,
		`Repository: ${args.repository}`,
		`Run: ${args.runId} (attempt ${args.runAttempt})`,
		`Commit: ${args.sha}`,
		`Date: ${args.artifactDate}`,
		`Dedupe key: ${args.decision.dedupeKey}`,
		`Reasons: ${args.decision.reasons.join(' | ')}`,
		`Run URL: ${args.runUrl}`,
		`Owner: ${args.owner}`,
		`Escalation: ${args.escalationPath}`
	].join('\n');

	return {
		text: summary,
		dedupeKey: args.decision.dedupeKey,
		repository: args.repository,
		workflow: args.workflow,
		runId: args.runId,
		runAttempt: args.runAttempt,
		sha: args.sha,
		artifactDate: args.artifactDate,
		reasons: args.decision.reasons,
		missingArtifacts: args.decision.missingArtifacts,
		runUrl: args.runUrl,
		owner: args.owner,
		escalationPath: args.escalationPath
	};
}

async function postAlert(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
	const response = await fetch(webhookUrl, {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`alert webhook returned HTTP ${response.status}: ${body}`);
	}
}

export async function runNightlyOperationalAlert(
	env: NodeJS.ProcessEnv = process.env
): Promise<void> {
	const artifactDate = new Date().toISOString().slice(0, 10);
	const workflow = env.GITHUB_WORKFLOW ?? 'integration-full-nightly';
	const repository = env.GITHUB_REPOSITORY ?? 'unknown-repository';
	const runId = env.GITHUB_RUN_ID ?? 'local';
	const runAttempt = parseRunAttempt(env.GITHUB_RUN_ATTEMPT);
	const runUrl = `https://github.com/${repository}/actions/runs/${runId}`;
	const jobStatus = env.NIGHTLY_ALERT_JOB_STATUS ?? 'unknown';
	const requiredArtifactPaths = parseRequiredArtifactPaths(env.NIGHTLY_ALERT_REQUIRED_ARTIFACTS);
	const owner = env.NIGHTLY_ALERT_OWNER ?? 'CI/workflow maintainers';
	const escalationPath =
		env.NIGHTLY_ALERT_ESCALATION_PATH ?? 'Escalate to engineering manager on-call';

	const decision = evaluateNightlyAlertDecision({
		jobStatus,
		requiredArtifactPaths,
		artifactExists: (artifactPath) => existsSync(resolve(process.cwd(), artifactPath)),
		artifactDate,
		runId,
		runAttempt
	});

	const contextPath = join(
		process.cwd(),
		'logs',
		'ci',
		'integration-full',
		'nightly-alert-context.json'
	);
	mkdirSync(dirname(contextPath), { recursive: true });
	writeFileSync(
		contextPath,
		JSON.stringify(
			{
				artifactDate,
				workflow,
				repository,
				runId,
				runAttempt,
				runUrl,
				jobStatus,
				requiredArtifactPaths,
				decision
			},
			null,
			2
		),
		'utf8'
	);

	if (!decision.shouldAlert) {
		console.log('[nightly-alert] no alert needed');
		return;
	}

	if (decision.duplicateSuppressed) {
		console.warn(
			`[nightly-alert] duplicate suppressed for run attempt ${runAttempt} (dedupe key: ${decision.dedupeKey})`
		);
		return;
	}

	const webhookUrl = env.NIGHTLY_ALERT_WEBHOOK_URL?.trim();
	if (!webhookUrl) {
		throw new Error('NIGHTLY_ALERT_WEBHOOK_URL is required when nightly alert conditions are met');
	}

	const payload = buildAlertPayload({
		decision,
		repository,
		workflow,
		runId,
		runAttempt,
		sha: env.GITHUB_SHA ?? 'unknown-sha',
		runUrl,
		artifactDate,
		owner,
		escalationPath
	});

	await postAlert(webhookUrl, payload);

	const dispatchPath = join(
		process.cwd(),
		'logs',
		'ci',
		'integration-full',
		'nightly-alert-dispatch.json'
	);
	writeFileSync(
		dispatchPath,
		JSON.stringify(
			{
				dispatchedAt: new Date().toISOString(),
				dedupeKey: decision.dedupeKey,
				runAttempt,
				reasons: decision.reasons
			},
			null,
			2
		),
		'utf8'
	);

	console.log(`[nightly-alert] dispatched operational alert (${decision.dedupeKey})`);
}
