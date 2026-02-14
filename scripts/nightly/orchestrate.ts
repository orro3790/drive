import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type DrillResult = {
	passed: boolean;
	skipped: boolean;
	durationMs: number;
	exitCode: number | null;
};

const today = new Date().toISOString().slice(0, 10);
const logDir = join(process.cwd(), 'logs', 'nightly', today);
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

function hasPackageScript(name: string): boolean {
	try {
		const pkgPath = join(process.cwd(), 'package.json');
		const raw = readFileSync(pkgPath, 'utf8');
		const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
		return Boolean(pkg.scripts && typeof pkg.scripts[name] === 'string');
	} catch {
		return false;
	}
}

function runDrill(name: string, command: string): DrillResult {
	const start = Date.now();
	console.log(`\n=== Running ${name} ===\n`);

	try {
		// Use execSync for the simplest "inherit" behavior.
		execSync(command, { stdio: 'inherit', cwd: process.cwd() });
		return { passed: true, skipped: false, durationMs: Date.now() - start, exitCode: 0 };
	} catch (err: any) {
		const exitCode: number | null =
			typeof err?.status === 'number' ? err.status : typeof err?.code === 'number' ? err.code : 1;
		console.error(`${name} failed (exitCode=${exitCode ?? 'null'})`);
		return { passed: false, skipped: false, durationMs: Date.now() - start, exitCode };
	}
}

async function checkDevServer(): Promise<{ ok: boolean; baseUrl: string | null }> {
	const configured = process.env.BASE_URL?.trim();
	const candidates = configured
		? [configured]
		: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'];

	for (const candidate of candidates) {
		const base = candidate.replace(/\/+$/, '');
		try {
			const res = await fetch(`${base}/`, {
				method: 'HEAD',
				signal: AbortSignal.timeout(2000),
				redirect: 'manual'
			});
			if (res.status > 0) {
				return { ok: true, baseUrl: base };
			}
		} catch {
			// try next candidate
		}
	}

	return { ok: false, baseUrl: null };
}

async function main(): Promise<void> {
	const results: Record<string, DrillResult> = {};

	results.cronE2E = runDrill('Cron E2E', 'pnpm nightly:cron-e2e');
	results.lifecycleE2E = runDrill('Lifecycle E2E', 'pnpm nightly:lifecycle-e2e');

	const witnessScriptExists = hasPackageScript('nightly:witness-ui');
	const devServer = await checkDevServer();

	if (witnessScriptExists && devServer.ok) {
		// If we auto-detected a viable dev server URL, prefer to pass it through
		// so witness-ui uses the same origin (important for localhost vs 127.0.0.1).
		if (!process.env.BASE_URL && devServer.baseUrl) {
			process.env.BASE_URL = devServer.baseUrl;
		}
		results.witnessUI = runDrill('Witness UI', 'pnpm nightly:witness-ui');
	} else {
		const reason = !witnessScriptExists
			? 'nightly:witness-ui script missing'
			: `dev server not detected (BASE_URL=${process.env.BASE_URL ? 'set' : 'unset'})`;
		console.log(`\n=== Skipping Witness UI (${reason}) ===\n`);
		results.witnessUI = { passed: true, skipped: true, durationMs: 0, exitCode: 0 };
	}

	const allPassed = Object.values(results).every((r) => r.passed);
	const summary = {
		date: today,
		passed: allPassed,
		drills: results
	};

	writeFileSync(
		join(logDir, 'orchestrator-summary.json'),
		JSON.stringify(summary, null, 2),
		'utf8'
	);

	console.log('\n=== Orchestrator Summary ===');
	console.log(JSON.stringify(summary, null, 2));

	process.exit(allPassed ? 0 : 1);
}

// If a promise rejection escapes, make sure the process exits non-zero.
main().catch((err) => {
	console.error('[nightly/orchestrate] Unhandled error:', err);
	process.exit(1);
});
